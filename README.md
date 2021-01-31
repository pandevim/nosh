## Introduction
Nosh is inspired by [Bash](https://en.wikipedia.org/wiki/Bash_(Unix_shell)) piping, Python code style and clojure made on top of Node.js. This programming language in intended to be used for configuration with an almost functional approach. This is made using the [Ohm](https://github.com/harc/ohm) library for javascript.

## Getting Started

The run button on repli.it will run the FizzBuzz example program. To run another program, you can open a shell and run

```bash
$ node index.js path/to/program.nosh
```

## Origin and Goals
Inspiration is taken form bash Unix shell where you can do pipe values into one another to generate some results, i.e this will give sorted unique names
```bash
$ cat names.txt | uniq | sort
```
And we want to translate this philosophy to our language.

This language is meant to be used on the web with Nosh Terminal which offers an alternative way for people to interact with the web content.

Imagine you have a personal website and want your users to have an option to do things programmatically like: subscribing to your newsletter, sorting your projects by name, etc.

## Examples

Examples can be found inside the `examples/` directory on our [repl](https://repl.it/@RedMonads/nosh#examples)!

## Roadmap
Nosh isn't completed yet, we are still figuring out the core philosophy of the language and the ecosystem idea we have in our minds to code but you can still run some of the examples in the repl.
The main reason to make the nosh language is to be used inside the Nosh terminal that would be avaiable as a web component and you just use to add it in html like this:
```html
<head>
  <script type="module" src="https://unpkg.com/@rednomads/nosh-terminal/dist/index.esm.js"></script>
</head>
<body>
  <!-- whole website code -->
  <nosh-terminal src="commands/" menu-bar="enable" type="text/nosh" allow="halfscreen" autostart dark />
</body>
```
| A GIF illustrating how the terminal UI would look like |
| - |
| ![nosh](https://user-images.githubusercontent.com/31156696/91661874-49db7a00-eafc-11ea-939f-fa22dc7dd605.gif) |
---
We also want our interpreter to be available as a npm package.
```bash
$ npm install nosh
```
And the API would look something like this:
```js
const { interpreter } = require('nosh')
const output = interpreter.run(`
show <- ['Hello, World!']
`)
```

**Source**: https://repl.it/@RedMonads/nosh

---
This submission is made by team @RedMonads for the [Repl lang-jam](https://repl.it/jam), where the language part is made by @jmanuel1 and designed by @AniruddhaPandey.

We're going to make this opensource and work on the roadmap along with developing this language more and we're looking for collaborators! If interested feel free to dm me on discord:`pandevim#5847`
