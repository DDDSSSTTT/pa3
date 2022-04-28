import { parser } from "lezer-python";
import { TreeCursor } from "lezer";
import { parseProgram } from "./parser";
import { tcProgram } from './tc';
import * as compiler from "./compiler";

export function stringifyTree(t: TreeCursor, source: string, d: number){
    var str = "";
    var spaces = " ".repeat(d*2);
    str += spaces + t.type.name;
    if(["Number", "CallExpression", "BinaryExpression", "UnaryExpression", "ParamList", "VariableName", "TypeDef"].includes(t.type.name)){
        str += "-->" + source.substring(t.from, t.to); 
    }
    str += "\n";
    if(t.firstChild()){
        do{
            str += stringifyTree(t, source, d + 1);
        }while(t.nextSibling());
        t.parent(); 
    }
    return str; 
}

// var source = "x : int = 1\ny : int = 2\nif x < y:\n  pass\nelse:\n  x = -x\nx";
// class C(object):\nx : int = 123\nc : C = None\nc = C()\nprint(c.x)
// var source = "class C(object):\n  x : int = 123\n  def getX(self: C) -> int:\n    return self.x\n  def setX(self: C, x: int):\n    self.x = x\nc : C = None\nc = C()\nprint(c.getX())\nc.setX(42)\nprint(c.getX())";

var source = "class C(object):\n  x : int = 123\n  def getX(self: C) -> int:\n    return self.x\n  def setX(self: C, x: int):\n    self.x = x\nc : C = None\nc = C()\nprint(c.getX())\nc.setX(42)\nprint(c.getX())";
var raw = parser.parse(source)
console.log(stringifyTree(raw.cursor(), source, 0))

let ast = parseProgram(source);
// console.log(ast);
ast = tcProgram(ast);
console.log("???\n", ast);
console.log("END", ast[ast.length-1])

const out = compiler.compile(source)
console.log(out)