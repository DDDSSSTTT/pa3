import wabt from 'wabt';
import {Stmt, Expr, Type, Op} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';
var loop_counter: number = 0;
type Env = Map<string, boolean>;

function variableNames(stmts: Stmt<Type>[]) : string[] {
  const vars : Array<string> = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "assign" && !(vars.includes(stmt.name))) { vars.push(stmt.name); }
  });
  return vars;
}
function funs(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag === "define");
}
function nonFuns(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag !== "define");
}
function varsFunsStmts(stmts: Stmt<Type>[]) : [string[], Stmt<Type>[], Stmt<Type>[]] {
  return [variableNames(stmts), funs(stmts), nonFuns(stmts)];
}

export async function run(watSource : string, config: any) : Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}

export function opStmts(op : Op) {
  switch(op) {
    case "+": return [`i32.add`];
    case "-": return [`i32.sub`];
    case "*": return [`i32.mul`];
    case "//": return [`i32.div_s`];
    case "%": return [`i32.rem_s`];

    case ">": return [`i32.gt_s`];
    case "<": return [`i32.lt_s`];
    case ">=": return [`i32.ge_s`];
    case "<=": return [`i32.le_s`];
    case "==": return [`i32.eq`];
    case "!=": return [`i32.ne`];

    case "and": return [`i32.and`];
    case "or": return [`i32.or`];
    default:
      throw new Error(`[Compiler.ts]Unhandled or unknown op: ${op}`);
  }
}

export function codeGenExpr(expr : Expr<Type>, locals : Env) : Array<string> {
  switch(expr.tag) {
    case "number": return [`(i32.const ${expr.value})`];
    case "true": return [`(i32.const 1)`];
    case "false": return [`(i32.const 0)`];
    case "id":
      // Since we type-checked for making sure all variable exist, here we
      // just check if it's a local variable and assume it is global if not
      if(locals.has(expr.name)) { return [`(local.get $${expr.name})`]; }
      else { return [`(global.get $${expr.name})`]; }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs, locals);
      const rhsExprs = codeGenExpr(expr.rhs, locals);
      if (expr.op == 'is'){
        console.log("compiler lhs/rhs: ", expr.lhs, expr.rhs);
        console.log(expr.lhs.a == expr.rhs.a, expr.lhs.a===expr.rhs.a);
        if (expr.lhs.a === expr.rhs.a){
          // Same like return true
          return [`(i32.const 1)`]
        } else {
          return [`(i32.const 0)`]
        }
      }
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "call":
      const valStmts = expr.args.map(e => codeGenExpr(e, locals)).flat();
      let toCall = expr.name;
      if(expr.name === "print") {
        console.log ("parse print, a = "+expr.args[0])
        switch(expr.args[0].a) {
          case "bool": toCall = "print_bool"; break;
          case "int": toCall = "print_num"; break;
          case "none": toCall = "print_none"; break;
        }
      }
      valStmts.push(`(call $${toCall})`);
      console.log(valStmts);
      return valStmts;
  }
}
export function codeGenStmt(stmt : Stmt<Type>, locals : Env, global_vars : Env) : Array<string> {
  switch(stmt.tag) {
    case "define":
      const withParamsAndVariables = new Map<string, boolean>(locals.entries());

      // Construct the environment for the function body
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

      const stmts = stmt.body.map(s => codeGenStmt(s, withParamsAndVariables,global_vars)).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, locals);
      if(locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { 
        // Dealing with globals
        valStmts.push(`(global.set $${stmt.name})`); 
      }
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr, locals);
      result.push("(local.set $scratch)");
      return result;
    case "pass":
        const donothing : string[] =[]
        return donothing;
    case "if":
    //  { a?: A, tag: "if", cond: Expr<A>, body: Stmt<A>[], else_body: Stmt<A>[]}
      var condExpr = codeGenExpr(stmt.cond,locals); //generate condition
      let out = condExpr.concat([`(if`]).concat([`(then`]);
      var body_stmts = stmt.body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));//generate then body
      out = out.concat(body_stmts).concat([`)`]);
      if (stmt.else_body.length>0){
        out = out.concat(`(else`)
        var else_stmts =  stmt.else_body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));//generate the else body
        out = out.concat(else_stmts).concat(`)`)
      } 
      //end the if statement
      out = out.concat([`)`]);
      return out;
    case "while":
    // { a?: A, tag: "while",cond: Expr <A>, body: Stmt<A>[]}
      var condwhile = codeGenExpr(stmt.cond,locals);
      let whileout = condwhile.concat([`(if`]).concat([`(then`]);
      // Need to check the cond before enter this loop
      whileout = whileout.concat([`(loop $myLoop${loop_counter}`]);
      var body_stmts = stmt.body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));
      whileout = whileout.concat(body_stmts)
      whileout = whileout.concat(condwhile).concat([`br_if $myLoop${loop_counter}`]);
      //Endloop
      whileout = whileout.concat([`)`]);
      //Endwhile(
      whileout = whileout.concat([`)`]).concat([`)`])
      loop_counter += 1;
      return whileout
  }
}
export function compile(source : string) : string {
  let ast = parseProgram(source);
  console.log("parsed program, ast:", ast)
  ast = tcProgram(ast);
  console.log("after tc, ast:", ast)
  const emptyEnv = new Map<string, boolean>();
  const [vars, funs, stmts] = varsFunsStmts(ast);
  const funsCode : string[] = funs.map(f => codeGenStmt(f, emptyEnv, emptyEnv)).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const varDecls = vars.map(v => `(global $${v} (mut i32) (i32.const 0))`).join("\n");

  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv, emptyEnv)).flat();

  const main = [`(local $scratch i32)`, ...allStmts].join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return `
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
