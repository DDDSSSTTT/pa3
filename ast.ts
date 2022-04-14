import { PassThrough } from "stream"
import { UnionType } from "typescript"

export type Type =
  | "int"
  | "bool"
  | "none"

export type Parameter =
  | { name: string, typ: Type }
export type Program<A> =
    | { a?: A, varinits: VarInit<A>[], fundefs: FunDef<A>[],stmt: Stmt<A>[] }
export type VarInit<A> = {a?: A, name:string, type:Type, init:Literal<A>}
export type FunDef<A> = {a?: A, name:string,params: TypedVar<A>[], ret: Type, inits:VarInit<A>[], body: Stmt<A>}
export type TypedVar<A> = {a?: A, name: string, type:Type}

export type Stmt<A> =
  | { a?: A, tag: "assign", name: string, value: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "define", name: string, params: Parameter[], ret: Type, body: Stmt<A>[] }
  | { a?: "none", tag:"pass"}
  | { a?: A, tag: "return", value: Expr<A> }
  | { a?: A, tag: "if", cond: Expr<A>, body: Stmt<A>[], else_body: Stmt<A>[]}
  | { a?: A, tag: "while",cond: Expr <A>, body: Stmt<A>[]}

export type Expr<A> = 
  | { a?: A, tag: "number", value: number }
  | { a?: A, tag: "true" }
  | { a?: A, tag: "false" }
  | { a?: A, tag: "none" }
  | { a?: A, tag: "builtin1", name: string, arg: Expr<A> }
  | { a?: A, tag: "builtin2", name: string, arg1: Expr<A>, arg2: Expr<A> }
  | { a?: A, tag: "literal", literal:Literal<A> }
  | { a?: A, tag: "binop", op: Op, lhs: Expr<A>, rhs: Expr<A> }
  | { a?: A, tag: "id", name: string, global?: boolean }
  | { a?: A, tag: "call", name: string, args: Expr<A>[] }


const int_ops = {"+": true, "-": true, "*" : true,"//" : true, "%": true,
                 ">": true, "<":true, ">=": true, "<=": true};
const same_ops = {"==":true,"!=":true};
const bool_ops = { "and": true, "or": true};
const spec_ops = {"is": true};
const uni_ops = {"not": true, "-": true};
export type Op = keyof (typeof int_ops)|keyof (typeof bool_ops)|keyof (typeof same_ops)|keyof (typeof spec_ops);
export type uniOp = keyof (typeof uni_ops)
export type Literal<A> =
    | { a?:A, tag: "number", value: number }
    | { a?:A, tag: "bool", value: boolean}
    | { a?:A, tag: "none"}
export function isOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in int_ops || maybeOp in bool_ops|| maybeOp in same_ops|| maybeOp in spec_ops;
}
export function isintOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in int_ops;
}
export function isboolOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in bool_ops;
}
export function issameOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in same_ops;
}
export function isuniOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in uni_ops;
}