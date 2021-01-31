const fs = require('fs')
const ohm = require('ohm-js')
const ohmExtras = require('ohm-js/extras');
const contents = fs.readFileSync('grammar.ohm')
const grammar = ohm.grammar(contents)
const { transformIndents } = require('./tokenize');
const readline = require('readline-sync');
const path = require('path');

const fileName = process.argv[2];

fs.readFile(fileName, 'utf8', (err, source) => {
	if ( err ) throw err

  // console.log(JSON.stringify(transformIndents(source)));

  source = transformIndents(source);

  let match = grammar.match(source);
  if ( match.succeeded() ) {
    // console.log(JSON.stringify(ohmExtras.toAST(match), null, "  "));
    console.log('SUCCEEDED')
  }
  else if ( match.failed() ) {
    console.log('FAILED')
    // console.log(match.message);
    const trace = grammar.trace(source);
    // console.log(trace.toString());
    return;
  }

  
  semantics(match).interpret();

})


function show(values) {
  return console.log(JSON.stringify(values, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }));
}



class ScopeStack extends Array {
  
  last() {
    return this[this.length - 1];
  }
  get(name) {
    // FIXME: Lexical scoping
    for (let scope of [...this].reverse()) {
      if (scope[name] !== undefined) {
        return scope[name];
      }
    }
    // throw new Error(`${name} does not exist here`);
  }
  copy() {
    return new ScopeStack(...this);
  }
}
let scopes = new ScopeStack({
  input(prompts) {
    return prompts.map(prompt => readline.question(prompt));
  },
  show
});

// reference: https://github.com/harc/ohm/blob/master/examples/math/index.html#L146


const semantics = grammar.createSemantics();
semantics.addOperation(
  'interpret',
  {
    Program(exprs) {
      exprs.children.forEach(expr => expr.interpret());
      // console.log(exprs);
    },
    Expr(expr) {
      return expr.interpret();
    },
    Expr_call(fun, _, expr) {
      let funValue = fun.interpret();
      if (fun.ctorName === 'Expr_name' && scopes.last()[fun.sourceString] === undefined) {
        funValue = undefined; // force local ref cell
        // TODO: Way to access nonlocal refs
      }
      const eValue = resolveRefCellToValue(expr.interpret());
      if (funValue === undefined) {
        // Create a function that acts like a variable
        if (fun.ctorName === 'Expr_name') {
          let cell = undefined;
          scopes.last()[fun.sourceString] = value => {
            if (value === undefined) {
              return cell;
            }
            return cell = value;
          };
          funValue = scopes.last()[fun.sourceString];
          funValue.isRefCell = true;
        } else if (fun.ctorName === 'Expr_lookup') {
          throw new Error('not implemented');
        } else {
          throw new Error('internal interpreter error: something is very wrong');
        }
      } else if (!(typeof funValue === 'function')) {
        throw new Error(`${fun.sourceString}, which evaluates to ${funValue}, is not a function`);
      }
      // console.log('calling function', fun.sourceString, 'which is', funValue.toString())
      if (funValue.isRefCell) {
        
        funValue = resolveRefCellToCell(funValue);
      }
      return funValue(eValue);
    },
    Expr_list(list) {
      return list.interpret();
    },
    Expr_assignment(id, _, expr) {
      scopes.last()[id.sourceString] = expr.interpret();
    },
    Expr_name(id) {
      // console.log(id.sourceString, scopes.last()[id.sourceString]);
      return scopes.get(id.sourceString);
    },
    Expr_lookup(ns, _, id) {
      let nsValue = ns.interpret();
      if (typeof nsValue === 'function') {
        nsValue = transformToNamespace(nsValue);
      }
      if (nsValue[id.sourceString] === undefined) {
        // console.log(scopes);
        // console.log('ns is', nsValue)
        throw new Error(`no ${id.sourceString} property in ${ns.sourceString}, which evaluates to ${JSON.stringify(nsValue)}`);
      }
      return nsValue[id.sourceString];
    },
    Expr_import(_1, _2, id) {
      // console.log('importing', id.sourceString)
      return scopes.last()[id.sourceString] = nosh_import(id.sourceString);
    },
    Expr_block(arg, _, ret, suite) {
      // kinda a closure
      let closure = scopes.copy();
      // console.log('closure', closure, 'of', this.sourceString)
      if (arg.child(0).ctorName === 'id') {
        const argName = arg.sourceString;
        const retName = ret.sourceString;
        function block(argument) {
          [scopes, closure] = [closure, scopes];
          scopes.push({[argName]: argument});
          suite.interpret();
          const oldScope = scopes.pop();
          // console.log('old scope', oldScope)
          // console.log('rest of scopes', scopes)
          const result = resolveRefCellToValue(oldScope[retName]);
          // console.log('block returned', result);
          [scopes, closure] = [closure, scopes];
          return result;
        }
        return block;
      } else if (arg.child(0).ctorName === 'Arg_list') {
        const argNames = arg.child(0).child(1).sourceString.split(',').map(a => a.trim());
        // console.log(argNames);
        const retName = ret.sourceString;
        function block(argument) {
          [scopes, closure] = [closure, scopes];
          scopes.push({});
          argNames.map((argName, i) =>
            scopes.last()[argName] = [argument[i]])
          suite.interpret();
          const oldScope = scopes.pop();
          // console.log('old scope', oldScope)
          // console.log('rest of scopes', scopes)
          const result = resolveRefCellToValue(oldScope[retName]);
          // console.log('block returned', result);
          [scopes, closure] = [closure, scopes];
          return result;
        }
        return block;
      } else {
        throw new Error('internal interpreter error, something is very wrong');
      }
    }, // Arg "->" Return Suite
    Expr_repeat(_1, _2, list, _3, name, suite) {
      const data = list.interpret();
      const id = name.sourceString;
      const result = [];
      for (let item of data) {
        // console.log('in repeat where item is', item)
        // console.log('in scope', scopes.last())
        scopes.last()[id] = [item];
        result.push(suite.interpret());
      }
      return result;
    }, // "repeat" "<-" Data "->" id Suite 
    Expr_funcdef(id, _, block) {
      // console.log('defining function', id.sourceString);
      // console.log('in scope', scopes.last())
      return scopes.last()[id.sourceString] = block.interpret();
    }, // id "<-" Expr_block
    Expr_condition(if_, elses) {
      const conds = [if_, ...elses.children].map(c => c.interpret());
      for (let cond of conds) {
        // console.log('condition is', cond.condition.sourceString)
        const bools = resolveRefCellToValue(cond.condition.interpret());
        // console.log('evaluates to', bools)
        if (bools.every(x => x)) {
          return cond.branch.interpret();
        }
      }
      return null;
    }, // If Else*
    If(_1, _2, condition, suite) {
      return {condition, branch: suite};
    }, // "if" "<-" Condition Suite
    Else(_1, _2, condition, suite) {
      return {condition, branch: suite};
    }, // "else" "<-" Condition Suite
    RelExpr(mulexpr, relops, mulexprs) {
      if (!mulexprs.numChildren) {
        return mulexpr.interpret();
      }
      const trues = [];
      // console.log('scopes during relexpr', scopes)
      mulexprs = [mulexpr, ...mulexprs.children].map(m => m.interpret());
      // console.log('most lhs of relexpr', mulexpr.sourceString);
      for (let i = 0; i < mulexprs[0].length; i++) {
        trues.push(true);
      }
      // console.log('evalauted mulexprs', mulexprs)
      const result = relops.children.reduce((result, op, index) => {
        return result.map((r, i) => {
          if (op.sourceString === '==') {
            return r && mulexprs[index][i] === mulexprs[index + 1][i];
          } else if (op.sourceString === '<') {
            return r && mulexprs[index][i] < mulexprs[index + 1][i];
          } else {
            throw new Error('not implemented');
          }
        });
      }, trues);
      // console.log('relexpr is', this.sourceString);
      // console.log('evaluates to', result)
      return result;
    }, // MulExpr (relop MulExpr)*
    BoolExpr_bool(lhs, op, rhs) {
      const lhsValue = lhs.interpret();
      const rhsValue = rhs.interpret();
      if (lhsValue.length != rhsValue.length) {
        throw new Error('cannot do bool operation on lists of unequal length');
      }
      return lhsValue.map((l, index) => {
        if (op.sourceString === 'and') {
          return l && rhsValue[index];
        } else {
          throw new Error('not implemented');
        }
      });
    }, // BoolExpr (boolop RelExpr)
    MulExpr_mul(lhs, op, rhs) {
      const lhsValue = lhs.interpret();
      const rhsValue = rhs.interpret();
      if (lhsValue.length != rhsValue.length) {
        throw new Error('cannot do arithmetic operation on lists of unequal length');
      }
      return lhsValue.map((l, index) => {
        if (op.sourceString === 'mod') {
          return l % rhsValue[index];
        } else {
          throw new Error('op not implemented', op.sourceString);
        }
      });
    }, // MulExpr (mulop (Data | Expr_name))
    AddExpr_add(lhs, op, rhs) {
      let lhsValue = resolveRefCellToValue(lhs.interpret());
      let rhsValue = resolveRefCellToValue(rhs.interpret());
      if (lhsValue.length !== rhsValue.length) {
        throw new Error('cannot do arithmetic operation on lists of unequal length');
      }
      // console.log('lhs is', lhsValue.toString())
      return lhsValue.map((l, index) => {
        if (op.sourceString === 'add') {
          return l + rhsValue[index];
        } else {
          throw new Error('op not implemented', op.sourceString);
        }
      });
    }, // AddExpr (addop (Data | Expr_name))
    Suite(_1, exprs, _2) {
      let value;
      for (let expr of exprs.children) {
        // console.log('in suite interpeting', expr.sourceString);
        value = expr.interpret();
      }
      return value;
    }, // indent Expr+ dedent
    Data(list) {
      return list.interpret();
    },
    Data_range(_1, start, _2, _3, _4, end, _5) {
      const startValue = start.interpret();
      const endValue = end.interpret();
      const list = [];
      for (let i = startValue; i <= endValue; i++) {
        list.push(i);
      }
      return list;
    },
    List(_1, parts, _2) {
      return parts.interpret();
    },
    NonemptyListOf(elem, seps, elems) {
      return [elem.interpret(), ...elems.children.map((e) => e.interpret())];
    },
    NumberLiteral(digits) {
      return BigInt(digits.sourceString);
    },
    quoteString(_1, chars, _2) {
      // FIXME
      // console.log('in string', chars.children.map(c => c.interpret()).join(''))
      // console.log(chars.sourceString)
      return chars.sourceString;
    },
    BooleanLiteral(bool) {
      if (bool.sourceString === 'true') {
        return true;
      }
      return false;
    }
    // _terminal() {
    //   // console.log('TERMINAL', this)
    //   return this.primitiveValue;
    // }
  }
);

function nosh_import(name) {
  if (name === 'math') {
    return {
      rand([low, high]) {
        return [Math.random() * Number(high - low) - Number(low)];
      }
    };
  } else if (name === 'text') {
    return {
      len(strings) {
        return strings.map(s => BigInt(s.length));
      },
      concat(strings) {
        return [strings.reduce((acc, s) => acc + s, '')];
      }
    };
  } else if (name === 'data') {
    return {
      num(strings) {
        return strings.map(s => s.indexOf('.') > -1 ? Number(s) : BigInt(s));
      }
    }
  } else {
    let source = fs.readFileSync(path.join(path.dirname(fileName), name + '.nh'), 'utf8');
    source = transformIndents(source);

    let match = grammar.match(source);
    if ( match.failed() ) {
      console.log('FAILED')
      // console.log(match.message);
      const trace = grammar.trace(source);
      // console.log(trace.toString());
      return;
    }

    scopes.push({});
    semantics(match).interpret();
    const moduleScope = scopes.last();
    // console.log('module scope is', moduleScope)
    scopes.pop();
    return transformToNamespace(moduleScope[name]);
  }
  throw new Error(`no module ${name}`);
}

function transformToNamespace(fun) {
  fun = resolveRefCellToValue(fun);
  // console.log('function is', fun)
  const members = fun();
  const ns = {};
  // console.log('members are', members)
  for (let member of members) {
    ns[member[0]] = member[1];
  }
  return ns;
}

function resolveRefCellToValue(value) {
  while (value && value.isRefCell) {
    value = value();
  }
  return value;
}

function resolveRefCellToCell(value) {
  let cell;
  while (value && value.isRefCell) {
    [cell, value] = [value, value()];
  }
  if (cell === undefined) {
    throw new Error(`${value} does not hold a reference`);
  }
  return cell;
}
