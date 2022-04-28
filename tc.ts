import { none } from "binaryen";
import { classicNameResolver } from "typescript";
import { Expr, FunDef, issameOp, Literal, Stmt, Type, TypedVar, VarInit} from "./ast";
import { isintOp, isboolOp} from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;
type ClassEnv = Map <string,Stmt<any>>;
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
// export function tcFunDef(fun:FunDef<any>, cls : ClassEnv, env: TypeEnv): FunDef<Type>{
//   const localEnv = duplicateEnv(env)
//   //add params to env
//   fun.params.forEach(param=>{
//     localEnv.vars.set(param.name,param.type);
//   })
//   const typedParams = tcParams(fun.params);
//   //Add inits
//   const typedInits = tcVarInits(fun.inits, env);
//   fun.inits.forEach(init=>{
//     localEnv.vars.set(init.name,init.type);
//   })
//   localEnv.funs.set(fun.name,[fun.params.map(param=>param.type), fun.ret]);
//   //Check body
//   const typedStmts = tcStmt(fun.body,cls,localEnv.funs,localEnv.vars,localEnv.retType);
//   return {...fun,params: typedParams, inits:typedInits, body:typedStmts};
// }
export function tcExpr(e : Expr<any>, classes : ClassEnv, functions : FunctionsEnv, variables : BodyEnv) : Expr<Type> {
  const emptyEnv = new Map<string, Type>();

  switch(e.tag) {
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "none": return { ...e, a: "none" };
    case "binop": {
      // We currently enforce the lhs and rhs must be int
      const left = tcExpr(e.lhs,classes,functions,variables);
      const right = tcExpr(e.rhs,classes,functions,variables);
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
      var result:Expr<any>;
      if(e.name === "print") {
        if(e.args.length !== 1) { throw new Error("print expects a single argument"); }
        const newArgs = [tcExpr(e.args[0], classes,functions, variables)];
        const res : Expr<Type> = { ...e, a: "none", args: newArgs } ;
        return res;
      }
      if (classes.has (e.name)){
        const class_stmt = classes.get(e.name);
        if (class_stmt.tag != "class"){
          throw new Error (`Variable ${e.name} should be a class, however its tag is not`);
        } else {
          return {...e, a: {tag:"object",class:class_stmt.name}}
        }

      } else {
        if(!functions.has(e.name)) {
          throw new Error(`function ${e.name} not found`);
        }
        var [args, ret] = functions.get(e.name);
      if(args.length !== e.args.length) {
        throw new Error(`TC-call-function:Expected ${args.length} arguments but got ${e.args.length}`);
      }
      const newArgs = args.map((a, i) => {
        const argtyp = tcExpr(e.args[i], classes, functions, variables);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });
      result = { ...e, a: ret, args: newArgs }
      }


      return result;
    case "literal":
         e.literal = tcLiteral (e.literal)
            return {...e, a: e.literal.a};
    case "builtin2":
        const arg1 = tcExpr(e.arg1, classes,functions,variables);
        const arg2 = tcExpr(e.arg2, classes,functions,variables);
        if (arg1.a!= "int"){
          throw new Error("TYPE ERROR: Left must be int")
        }
        if (arg2.a!= "int"){
          throw new Error("TYPE ERROR: Right must be int")
        }
        return {...e,a: "int"}
    case "method":
      const newObj = tcExpr(e.obj,classes,functions,variables);
      var newArgs:Expr<Type>[];
      if (newObj.a != "int" &&newObj.a != "bool" &&newObj.a != "none"){
        if (newObj.a.tag !=="object") {throw "Non-object type in method call";}
        if (!classes.has(newObj.a.class)){throw "Compiler error, no such class"}
        const classdata = classes.get(newObj.a.class);
        if (classdata.tag == "class"){
          if (!classdata.methods.has(e.name)){throw "No such method";}
          newArgs = e.args.map(a=>tcExpr(a,classes,functions,variables));
          const thisfun= classdata.methods.get(e.name);
          var argTyps = thisfun.params;
          var retType = thisfun.ret;
          // Here we must ignore self by adding 1 to the rhs
          if (argTyps.length !== newArgs.length+1){throw "tc: method arg mismatch";}
          argTyps.forEach((t,i)=>{
            if (t.name != "self"&& !assignableTo(t.typ,newArgs[i].a)){throw `Arg Types mismatch for ${t} and ${i}`;}
          })
        } else {
          throw `Tag says ${e.name} is a method, but annotation says it isn't an object`
        }
        }

      return { ...e, a:"none", obj:newObj,args:newArgs}
  case "getfield":
    var cls_name;
    if (e.obj.tag == "id"){
      cls_name = e.obj.name;
    }else {
      if (e.obj.tag=="self"){
        cls_name = e.obj.a.class;
      } else {
        throw new Error("tc: getfield, not an id, nor self")
      }
    }

      var cls_stmt = classes.get(cls_name)
      while (cls_stmt.tag =="assign"){
        // Parse cls_stmt
        cls_stmt = classes.get(cls_stmt.a.class)
      }
      if (cls_stmt.tag != "class"){
        throw new Error('tc: statement is not class')
      }
      var anno;
      cls_stmt.fields.forEach(fld => {
        if(fld.tag=="assign"&&fld.name==e.name){
          anno = fld.a;
          
        }
      });
      return { ...e,a:anno}
      
  }
}

export function tcStmt(s : Stmt<any>, classes : ClassEnv, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) : Stmt<Type> {
  console.log("tcStmt", s)
  switch(s.tag) {
    case "assign": {
      const rhs = tcExpr(s.value, classes, functions, variables);
      if (s.a===''){
        if (variables.has(s.name)){
          console.log("get_name",variables.get(s.name))
          s.a = variables.get(s.name);
        } else {
          throw new Error(`Cannot change the value of ${s.name} before its declaration`)
        }

      } 
      console.log("tcStmt-assign",s.a,rhs.a);
      console.log(assignableTo(s.a,rhs.a))
      if (!assignableTo(s.a,rhs.a)){
        // Make an exemption for assign "none" to "obj"
          throw new Error(`TYPE ERROR: Cannot assign ${rhs.a} to ${s.name}, which requires ${s.a}`);

      } else {
        if (rhs.a=="none" && isObject(s.a)){
          s.a = {tag:"object",class:s.a};
        } 
      }
      if(variables.has(s.name) && !assignableTo(variables.get(s.name),rhs.a)) {
        throw new Error(`${s.name} already declared, which requires ${s.a}`);
      }
      else {
        if (rhs.a == "none"){
          variables.set(s.name,s.a);
          console.log(variables.get(s.name))
        } else {
          variables.set(s.name,rhs.a)
        }
        console.log(variables);

      }
      classes.set(s.name,s);
      return { ...s, value: rhs };
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
      console.log("define-s.body",s.body);
      const newStmts = s.body.map(bs => tcStmt(bs, classes, functions, bodyvars, s.ret));
      return { ...s, body: newStmts };
    }
    case "class":{
      const bodyvars = new Map<string, Type>(variables.entries());
      s.fields.forEach(vi => {tcStmt(vi, classes,functions,bodyvars,"none")});
      console.log("s-fields:",s.fields);
      var new_methods = new Map <string, FunDef<Type>>();
      s.methods.forEach ((mds,name) =>{
        // Trickey Here,mds here is the FunDef
        console.log(mds);
        console.log(mds.body);
        var stmt_from_mds:Stmt<Type> = {a:mds.a,tag:"define",name: mds.name,params:mds.params,ret:mds.ret,body:mds.body}
        let result = tcStmt(stmt_from_mds,classes,functions,bodyvars,mds.ret);
        var mds_from_stmt:FunDef<Type> = {a:result.a,name: mds.name,params:mds.params,ret:mds.ret,inits:mds.inits,body:mds.body}
        new_methods.set(name,mds_from_stmt)
      });
      s.methods = new_methods;
      return {...s, a: "none"} 
    }
    case "expr": {
      const ret = tcExpr(s.expr, classes, functions, variables);
      return { ...s, expr: ret };
    }
    case "return": {
      const valTyp = tcExpr(s.value, classes, functions, variables);
      if(valTyp.a !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return { ...s, value: valTyp };
    }
    case "pass": {
      return {...s}
    }
    case "if":{
      const cond = tcExpr(s.cond, classes, functions,variables);
      if (cond.a!="bool"){
        throw new Error (`${cond} must be a bool, instead it is now ${cond.a}`)
      }
      const new_bd_st = s.body.map(bs => tcStmt(bs, classes, functions,variables,currentReturn));
      if (s.else_body.length===0){
        return {...s, cond:cond, body: new_bd_st}
      } else{
        const new_elsebd_st = s.else_body.map(bs => tcStmt(bs, classes, functions,variables,currentReturn));
        return  {...s, cond:cond, body: new_bd_st,else_body: new_elsebd_st}
      }
    }
    case "while":{
      const cond = tcExpr(s.cond,classes,functions,variables);
      if (cond.a!="bool"){
        throw new Error (`${cond} must be a bool, instead it is now ${cond.a}`)
      }
      const new_bd_st = s.body.map(bs => tcStmt(bs, classes, functions,variables,currentReturn));
      return {...s, cond:cond, body: new_bd_st}      
    }
  }
}

export function tcProgram(p : Stmt<any>[]) : Stmt<Type>[] {
  console.log("tcprogram,p",p)
  const functions = new Map<string, [Type[], Type]>();
  const classes = new Map<string, Stmt<any>>()
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.params.map(p => p.typ), s.ret]);
    }
    if (s.tag === "class"){
      classes.set(s.name, s);
    }
  });

  const globals = new Map<string, Type>();
  return p.map(s => {
    if(s.tag === "assign") {
      const rhs = tcExpr(s.value, classes, functions, globals);
      const tc_s = tcStmt(s, classes, functions,globals,rhs.a);
      // globals.set(s.name, rhs.a);
      return { ...s, value: rhs };
    }
    else {
      const res = tcStmt(s, classes, functions, globals, "none");
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
export function isObject(tp:Type) : boolean{
  return !(tp == "int" || tp == "bool" || tp == "none")
}
export function assignableTo(type_a: Type, type_b: Type) : boolean{
  // Rule No.0: if strictly equal, allow!
  if (type_b===type_a){
    return true;
  }

  // Rule No.1: None is able to be assigned to everyone.
  if (type_b == "none"){ 
  // Very Tricky here,must be fixed later
  return isObject(type_a)
  }

  // Rule No.2: Only Object is allowed to assign object.
  if (type_b!="int" && type_b !="bool"){
    if(type_a!="int" && type_a != "none" && type_a !="bool"){
      return type_a.class == type_b.class;
    }
  }
  return false;
}