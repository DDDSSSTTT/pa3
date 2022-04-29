import { compile, runwatsrc} from "../compiler";
import { tcProgram } from "../tc";
import { parseProgram } from "../parser";
import { importObject } from "./import-object.test";
import { none } from "binaryen";

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  let ast = parseProgram(source);
  ast = tcProgram(ast);
  var result = none;
  console.debug(ast);
  return ast[ast.length - 1].a;
}

// Modify run to use `importObject` (imported above) to use for printing
export async function run(source: string) {
  const wat = compile(source);
  var memory = new WebAssembly.Memory({initial:10, maximum:100});
  (importObject.imports as any).mem = memory
  const result = await runwatsrc(wat,importObject);
  return;
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};
