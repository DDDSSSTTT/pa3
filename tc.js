"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.tcLiteral = exports.tcProgram = exports.tcStmt = exports.tcExpr = exports.tcFunDef = exports.tcParams = exports.tcVarInits = void 0;
var ast_1 = require("./ast");
var ast_2 = require("./ast");
function duplicateEnv(env) {
    return { vars: new Map(env.vars), funs: new Map(env.funs), retType: env.retType };
}
function tcVarInits(inits, env) {
    var typedInits = [];
    inits.forEach(function (init) {
        var typedInit = tcLiteral(init.init);
        if (typedInit.a !== init.type)
            throw new Error("TYPE ERROR: init type does not match literal type");
        env.vars.set(init.name, init.type);
        typedInits.push(__assign(__assign({}, init), { a: init.type, init: typedInit }));
    });
    return typedInits;
}
exports.tcVarInits = tcVarInits;
function tcParams(params) {
    return params.map(function (param) {
        return __assign(__assign({}, param), { a: param.type });
    });
}
exports.tcParams = tcParams;
function tcFunDef(fun, env) {
    var localEnv = duplicateEnv(env);
    //add params to env
    fun.params.forEach(function (param) {
        localEnv.vars.set(param.name, param.type);
    });
    var typedParams = tcParams(fun.params);
    //Add inits
    var typedInits = tcVarInits(fun.inits, env);
    fun.inits.forEach(function (init) {
        localEnv.vars.set(init.name, init.type);
    });
    localEnv.funs.set(fun.name, [fun.params.map(function (param) { return param.type; }), fun.ret]);
    //Check body
    var typedStmts = tcStmt(fun.body, localEnv.funs, localEnv.vars, localEnv.retType);
    return __assign(__assign({}, fun), { params: typedParams, inits: typedInits, body: typedStmts });
}
exports.tcFunDef = tcFunDef;
function tcExpr(e, functions, variables) {
    switch (e.tag) {
        case "number": return __assign(__assign({}, e), { a: "int" });
        case "true": return __assign(__assign({}, e), { a: "bool" });
        case "false": return __assign(__assign({}, e), { a: "bool" });
        case "none": return __assign(__assign({}, e), { a: "none" });
        case "binop": {
            // We currently enforce the lhs and rhs must be int
            var left = tcExpr(e.lhs, functions, variables);
            var right = tcExpr(e.rhs, functions, variables);
            e.lhs = left;
            e.rhs = right;
            if (e.op == 'is') {
                // "is" operator logic
                console.log("is op, left, right", left, right);
                if (left.a == "int" || left.a == "bool") {
                    throw new Error("TYPE ERROR: LHS of 'is' must be an object");
                }
                if (right.a == "int" || right.a == "bool") {
                    throw new Error("TYPE ERROR: RHS of 'is' must be an object");
                }
                return __assign(__assign({}, e), { a: "bool" });
            }
            if ((0, ast_2.isintOp)(e.op)) {
                if (e.lhs.a != "int" || e.rhs.a != "int") {
                    throw new Error("TYPE ERROR: LHS,RHS of ".concat(e.op, " must be both int, instead, we have ").concat(e.lhs.a, ",").concat(e.rhs.a));
                }
                var return_bool_ops = [">", "<", ">=", "<="];
                console.log(return_bool_ops.includes(e.op));
                if (return_bool_ops.includes(e.op)) {
                    return __assign(__assign({}, e), { a: "bool" });
                }
                return __assign(__assign({}, e), { a: "int" });
            }
            else {
                if ((0, ast_2.isboolOp)(e.op)) {
                    if (e.lhs.a != "bool" || e.rhs.a != "bool") {
                        throw new Error("TYPE ERROR: LHS,RHS of ".concat(e.op, " must be both bool, instead, we have ").concat(e.lhs.a, ",").concat(e.rhs.a));
                    }
                    return __assign(__assign({}, e), { a: "bool" });
                }
                else {
                    if ((0, ast_1.issameOp)(e.op)) {
                        if (e.lhs.a == e.rhs.a) {
                            return __assign(__assign({}, e), { a: "bool" });
                        }
                        else {
                            throw new Error("TYPE ERROR: LHS,RHS of ".concat(e.op, " must be of same type, instead, we have ").concat(e.lhs.a, ",").concat(e.rhs.a));
                        }
                    }
                    else {
                        throw new Error("[tc.ts]Unhandled binary op ".concat(e.op));
                    }
                }
            }
        }
        case "id": return __assign(__assign({}, e), { a: variables.get(e.name) });
        case "call":
            if (e.name === "print") {
                if (e.args.length !== 1) {
                    throw new Error("print expects a single argument");
                }
                var newArgs_1 = [tcExpr(e.args[0], functions, variables)];
                var res = __assign(__assign({}, e), { a: "none", args: newArgs_1 });
                return res;
            }
            if (!functions.has(e.name)) {
                throw new Error("function ".concat(e.name, " not found"));
            }
            var _a = functions.get(e.name), args = _a[0], ret = _a[1];
            if (args.length !== e.args.length) {
                throw new Error("Expected ".concat(args.length, " arguments but got ").concat(e.args.length));
            }
            var newArgs = args.map(function (a, i) {
                var argtyp = tcExpr(e.args[i], functions, variables);
                if (a !== argtyp.a) {
                    throw new Error("Got ".concat(argtyp, " as argument ").concat(i + 1, ", expected ").concat(a));
                }
                return argtyp;
            });
            return __assign(__assign({}, e), { a: ret, args: newArgs });
        case "literal":
            e.literal = tcLiteral(e.literal);
            return __assign(__assign({}, e), { a: e.literal.a });
        case "builtin2":
            var arg1 = tcExpr(e.arg1, functions, variables);
            var arg2 = tcExpr(e.arg2, functions, variables);
            if (arg1.a != "int") {
                throw new Error("TYPE ERROR: Left must be int");
            }
            if (arg2.a != "int") {
                throw new Error("TYPE ERROR: Right must be int");
            }
            return __assign(__assign({}, e), { a: "int" });
    }
}
exports.tcExpr = tcExpr;
function tcStmt(s, functions, variables, currentReturn) {
    console.log("tcStmt", s);
    switch (s.tag) {
        case "assign": {
            var rhs = tcExpr(s.value, functions, variables);
            if (s.a === '') {
                if (variables.has(s.name)) {
                    s.a = variables.get(s.name);
                }
                else {
                    throw new Error("Cannot change the value of ".concat(s.name, " before its declaration"));
                }
            }
            console.log("tcStmt-assign", s.a, rhs.a, s.a == rhs.a);
            if (s.a !== rhs.a) {
                throw new Error("Cannot assign ".concat(rhs.a, " to ").concat(s.name, ", which requires ").concat(s.a));
            }
            if (variables.has(s.name) && variables.get(s.name) !== rhs.a) {
                throw new Error("".concat(s.name, " already declared, which requires ").concat(s.a));
            }
            else {
                variables.set(s.name, rhs.a);
            }
            return __assign(__assign({}, s), { value: rhs });
        }
        case "define": {
            var bodyvars_1 = new Map(variables.entries());
            s.params.forEach(function (p) { bodyvars_1.set(p.name, p.typ); });
            var newStmts = s.body.map(function (bs) { return tcStmt(bs, functions, bodyvars_1, s.ret); });
            return __assign(__assign({}, s), { body: newStmts });
        }
        case "expr": {
            var ret = tcExpr(s.expr, functions, variables);
            return __assign(__assign({}, s), { expr: ret });
        }
        case "return": {
            var valTyp = tcExpr(s.value, functions, variables);
            if (valTyp.a !== currentReturn) {
                throw new Error("".concat(valTyp, " returned but ").concat(currentReturn, " expected."));
            }
            return __assign(__assign({}, s), { value: valTyp });
        }
        case "pass": {
            return __assign({}, s);
        }
        case "if": {
            var cond = tcExpr(s.cond, functions, variables);
            if (cond.a != "bool") {
                throw new Error("".concat(cond, " must be a bool, instead it is now ").concat(cond.a));
            }
            var new_bd_st = s.body.map(function (bs) { return tcStmt(bs, functions, variables, currentReturn); });
            if (s.else_body.length === 0) {
                return __assign(__assign({}, s), { cond: cond, body: new_bd_st });
            }
            else {
                var new_elsebd_st = s.else_body.map(function (bs) { return tcStmt(bs, functions, variables, currentReturn); });
                return __assign(__assign({}, s), { cond: cond, body: new_bd_st, else_body: new_elsebd_st });
            }
        }
        case "while": {
            var cond = tcExpr(s.cond, functions, variables);
            if (cond.a != "bool") {
                throw new Error("".concat(cond, " must be a bool, instead it is now ").concat(cond.a));
            }
            var new_bd_st = s.body.map(function (bs) { return tcStmt(bs, functions, variables, currentReturn); });
            return __assign(__assign({}, s), { cond: cond, body: new_bd_st });
        }
    }
}
exports.tcStmt = tcStmt;
function tcProgram(p) {
    console.log("tcprogram,p", p);
    var functions = new Map();
    p.forEach(function (s) {
        if (s.tag === "define") {
            functions.set(s.name, [s.params.map(function (p) { return p.typ; }), s.ret]);
        }
    });
    var globals = new Map();
    return p.map(function (s) {
        if (s.tag === "assign") {
            var rhs = tcExpr(s.value, functions, globals);
            var tc_s = tcStmt(s, functions, globals, rhs.a);
            globals.set(s.name, rhs.a);
            return __assign(__assign({}, s), { value: rhs });
        }
        else {
            var res = tcStmt(s, functions, globals, "none");
            return res;
        }
    });
}
exports.tcProgram = tcProgram;
function tcLiteral(literal) {
    switch (literal.tag) {
        case "number":
            return __assign(__assign({}, literal), { a: "int" });
        case "bool":
            return __assign(__assign({}, literal), { a: "bool" });
        case "none":
            return __assign(__assign({}, literal), { a: "none" });
    }
}
exports.tcLiteral = tcLiteral;
