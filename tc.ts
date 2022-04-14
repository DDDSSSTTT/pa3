import { Expr, FunDef, issameOp, Literal, Stmt, Type, TypedVar, VarInit} from "./ast";
import { isintOp, isboolOp} from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;
type TypeEnv = {
  vars: BodyEnv
  funs: FunctionsEnv
  retType: Type

}
function duplicateEnv(env:TypeEnv) : TypeEnv {
  return {vars: new Map(env.vars),funs: new Map(env.funs), retType: env.retType}
}
export function tcVarInits(inits: VarInit<any>[], env: TypeEnv): VarInit<Type>[]{
  const typedInits : VarInit<Type>[] = [];
  inits.forEach((init)=>{
    const typedInit = tcLiteral(init.init)
    if (typedInit.a !== init.type)
      throw new Error("TYPE ERROR: init type does not match literal type")
    env.vars.set(init.name,init.type);
    typedInits.push({...init, a: init.type, init:typedInit});
  })
  return typedInits;
}
export function tcParams(params: TypedVar<any>[]) : TypedVar<Type>[]{
  return params.map(param=>{
    return {...param, a: param.type}
  })
}
export function tcFunDef(fun:FunDef<any>, env: TypeEnv): FunDef<Type>{
  const localEnv = duplicateEnv(env)
  //add params to env
  fun.params.forEach(param=>{
    localEnv.vars.set(param.name,param.type);
  })
  const typedParams = tcParams(fun.params);
  //Add inits
  const typedInits = tcVarInits(fun.inits, env);
  fun.inits.forEach(init=>{
    localEnv.vars.set(init.name,init.type);
  })
  localEnv.funs.set(fun.name,[fun.params.map(param=>param.type), fun.ret]);
  //Check body
  const typedStmts = tcStmt(fun.body,localEnv.funs,localEnv.vars,localEnv.retType);
  return {...fun,params: typedParams, inits:typedInits, body:typedStmts};
}
export function tcExpr(e : Expr<any>, functions : FunctionsEnv, variables : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "none": return { ...e, a: "none" };
    case "binop": {
      // We currently enforce the lhs and rhs must be int
      const left = tcExpr(e.lhs,functions,variables);
      const right = tcExpr(e.rhs,functions,variables);
      e.lhs = left;
      e.rhs = right;
      if (e.op == 'is'){
        // "is" operator logic
        console.log("is op, left, right",left,right);
        if (left.a == "int" || left.a =="bool"){
          throw new Error ("TYPE ERROR: LHS of 'is' must be an object")
        }
        if (right.a == "int" || right.a =="bool"){
          throw new Error ("TYPE ERROR: RHS of 'is' must be an object")
        }
        return {...e, a: "bool"}
      }
      if (isintOp(e.op)){
          if (e.lhs.a!="int" || e.rhs.a!="int"){
            console.log("TC Variables", variables)
            throw new Error(`TYPE ERROR: LHS,RHS of ${e.op} must be both int, instead, we have ${e.lhs.a},${e.rhs.a}`)
          }
          const return_bool_ops = [">","<",">=","<="]
          console.log(return_bool_ops.includes(e.op))
          if (return_bool_ops.includes(e.op)){
            return { ...e, a: "bool" };
          }
          return { ...e, a: "int" };
      } else {
        if (isboolOp(e.op)){
          if (e.lhs.a!="bool" || e.rhs.a!="bool"){
            throw new Error(`TYPE ERROR: LHS,RHS of ${e.op} must be both bool, instead, we have ${e.lhs.a},${e.rhs.a}`)
          }
          return { ...e, a: "bool" };
        } else {
          if (issameOp(e.op)){
            if (e.lhs.a==e.rhs.a){
              return { ...e, a: "bool" };
            } else {
              throw new Error(`TYPE ERROR: LHS,RHS of ${e.op} must be of same type, instead, we have ${e.lhs.a},${e.rhs.a}`)
            }
            
          } else {
            throw new Error (`[tc.ts]Unhandled binary op ${e.op}`);
          }          

        }  
      }   
    }
    case "id": return { ...e, a: variables.get(e.name) };
    case "call":
      if(e.name === "print") {
        if(e.args.length !== 1) { throw new Error("print expects a single argument"); }
        const newArgs = [tcExpr(e.args[0], functions, variables)];
        const res : Expr<Type> = { ...e, a: "none", args: newArgs } ;
        return res;
      }
      if(!functions.has(e.name)) {
        throw new Error(`function ${e.name} not found`);
      }

      const [args, ret] = functions.get(e.name);
      if(args.length !== e.args.length) {
        throw new Error(`Expected ${args.length} arguments but got ${e.args.length}`);
      }

      const newArgs = args.map((a, i) => {
        const argtyp = tcExpr(e.args[i], functions, variables);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });

      return { ...e, a: ret, args: newArgs };
    case "literal":
         e.literal = tcLiteral (e.literal)
            return {...e, a: e.literal.a};
    case "builtin2":
        const arg1 = tcExpr(e.arg1,functions,variables);
        const arg2 = tcExpr(e.arg2,functions,variables);
        if (arg1.a!= "int"){
          throw new Error("TYPE ERROR: Left must be int")
        }
        if (arg2.a!= "int"){
          throw new Error("TYPE ERROR: Right must be int")
        }
        return {...e,a: "int"}
  }
}

export function tcStmt(s : Stmt<any>, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) : Stmt<Type> {
  console.log("tcStmt", s)
  switch(s.tag) {
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables);
      if (s.a===''){
        if (variables.has(s.name)){
          s.a = variables.get(s.name);
        } else {
          throw new Error(`Cannot change the value of ${s.name} before its declaration`)
        }

      } 
      console.log("tcStmt-assign",s.a,rhs.a,s.a==rhs.a);
      if (s.a!==rhs.a){

          throw new Error(`Cannot assign ${rhs.a} to ${s.name}, which requires ${s.a}`);

      }
      if(variables.has(s.name) && variables.get(s.name) !== rhs.a) {
        throw new Error(`${s.name} already declared, which requires ${s.a}`);
      }
      else {
        variables.set(s.name, rhs.a);
      }
      return { ...s, value: rhs };
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
      const newStmts = s.body.map(bs => tcStmt(bs, functions, bodyvars, s.ret));
      return { ...s, body: newStmts };
    }
    case "expr": {
      const ret = tcExpr(s.expr, functions, variables);
      return { ...s, expr: ret };
    }
    case "return": {
      const valTyp = tcExpr(s.value, functions, variables);
      if(valTyp.a !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return { ...s, value: valTyp };
    }
    case "pass": {
      return {...s}
    }
    case "if":{
      const cond = tcExpr(s.cond,functions,variables);
      if (cond.a!="bool"){
        throw new Error (`${cond} must be a bool, instead it is now ${cond.a}`)
      }
      const new_bd_st = s.body.map(bs => tcStmt(bs,functions,variables,currentReturn));
      if (s.else_body.length===0){
        return {...s, cond:cond, body: new_bd_st}
      } else{
        const new_elsebd_st = s.else_body.map(bs => tcStmt(bs,functions,variables,currentReturn));
        return  {...s, cond:cond, body: new_bd_st,else_body: new_elsebd_st}
      }
    }
    case "while":{
      const cond = tcExpr(s.cond,functions,variables);
      if (cond.a!="bool"){
        throw new Error (`${cond} must be a bool, instead it is now ${cond.a}`)
      }
      const new_bd_st = s.body.map(bs => tcStmt(bs,functions,variables,currentReturn));
      return {...s, cond:cond, body: new_bd_st}      
    }
  }
}

export function tcProgram(p : Stmt<any>[]) : Stmt<Type>[] {
  console.log("tcprogram,p",p)
  const functions = new Map<string, [Type[], Type]>();
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.params.map(p => p.typ), s.ret]);
    }
  });

  const globals = new Map<string, Type>();
  return p.map(s => {
    if(s.tag === "assign") {
      const rhs = tcExpr(s.value, functions, globals);
      const tc_s = tcStmt(s,functions,globals,rhs.a)
      globals.set(s.name, rhs.a);
      return { ...s, value: rhs };
    }
    else {
      const res = tcStmt(s, functions, globals, "none");
      return res;
    }
  });
}
export function  tcLiteral(literal:Literal<any>): Literal<Type>{
  switch (literal.tag) {
    case "number":
      return {...literal, a: "int"};
    case "bool":
      return {...literal, a: "bool"};
    case "none":
      return {...literal, a: "none"};

  }
}