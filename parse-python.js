const python = require('lezer-python');

// const input = "def f(x): return x + 2\nf(4)";
function print_trees(scripts){
const tree = python.parser.parse(scripts);
const cursor = tree.cursor();
  do {
    console.log(cursor.node.type.name);
    console.log(scripts.substring(cursor.node.from, cursor.node.to));
  } while(cursor.next());
}
module.exports = {print_trees};
// print_trees(input);


