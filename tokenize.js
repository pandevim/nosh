const Lexer = require('lex');

const lexer = new Lexer(char => {
  throw new Error(`unexpected character at line ${line}: "${char}"`);
});

module.exports = function tokenize(source) {
  // adapted from https://github.com/aaditmshah/lexer#integration-with-jison
  const indent = [0];
  const tokens = [];

  for (let line of [...source.split('\n'), '']) {

    const lexeme = line.match(/^[\t ]*/)[0];
    // console.log(`indentation "${lexeme}"`);
    const indentation = lexeme.length;
    // console.log('possible indent of', indentation);

    if (indentation > indent[0]) {
      // console.log('indented by', indentation);
      indent.unshift(indentation);
      tokens.push({ type: "indent" });
    }

    while (indentation < indent[0]) {
      tokens.push({ type: 'dedent' });
      indent.shift();
    }
    tokens.push(...tokenizeLine(line));
  };
  return tokens;
}

module.exports.transformIndents = function transformIndents(source) {
  // adapted from https://github.com/aaditmshah/lexer#integration-with-jison
  const indent = [0];
  let newSource = '';
  const [INDENT, DEDENT] = '\x0f\x0e'; // ASCII shift in/out

  for (let line of [...source.split('\n'), '']) {
    if (line.trim() === '') {
      continue;
    }
    const lexeme = line.match(/^[\t ]*/)[0];
    // console.log(`indentation "${lexeme}"`);
    const indentation = lexeme.length;
    // console.log('possible indent of', indentation);

    if (indentation > indent[0]) {
      // console.log('indented by', indentation);
      indent.unshift(indentation);
      newSource += INDENT;
    }

    while (indentation < indent[0]) {
      newSource += DEDENT;
      indent.shift();
    }
    newSource += line + '\n';
  };
  newSource += DEDENT.repeat(indent.length - 1);
  return newSource;
}

function tokenizeLine(source) {
  let token = null;
  const tokens = [];
  lexer.setInput(source);
  while (token = lexer.lex()) {
    tokens.push(token);
  }
  return tokens;
}

let line = 1;

lexer.addRule(/get|repeat|in|if|fun/, lexeme =>
  ({ type: 'keyword', value: lexeme })
).addRule(/[\w_][\w0-9_]*/, lexeme =>
  ({ type: 'identifier', value: lexeme })
).addRule(/[()]/, lexeme =>
  ({ type: 'bracket', value: lexeme })
).addRule(/"(.*)"/, (lexeme, string) =>
  // TODO: Escapes
  ({ type: 'string', value: string })
).addRule(/->|<-/, lexeme =>
  ({ type: 'arrow', value: lexeme })
).addRule(/\/\/(.*)$/m, (lexeme, comment) =>
  ({ type: 'comment', value: comment })
).addRule(/==|>/, lexeme =>
  ({ type: 'operator', value: lexeme })
).addRule(/$/m, _ => { line++; }
).addRule(/\s+/, _ => {});
