import {parser} from 'lezer-python';
import {print_trees} from "./parse-python.js"
import { TreeCursor } from 'lezer';
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

var line = "class C(object):\n  x:int = 1\n  def print_x(self:C):\n    print(self.x)\nc:C = None\nc= C()\nprint(c.x)\nc.print_x()";
const t = parser.parse(line).cursor();
console.log(stringifyTree(t,line,0));
// print_trees(line)
// var ast = parse(line);
// console.log(JSON.stringify(ast,null,2));