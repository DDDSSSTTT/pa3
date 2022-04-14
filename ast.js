"use strict";
exports.__esModule = true;
exports.isuniOp = exports.issameOp = exports.isboolOp = exports.isintOp = exports.isOp = void 0;
var int_ops = { "+": true, "-": true, "*": true, "//": true, "%": true,
    ">": true, "<": true, ">=": true, "<=": true };
var same_ops = { "==": true, "!=": true };
var bool_ops = { "and": true, "or": true };
var spec_ops = { "is": true };
var uni_ops = { "not": true, "-": true };
function isOp(maybeOp) {
    return maybeOp in int_ops || maybeOp in bool_ops || maybeOp in same_ops || maybeOp in spec_ops;
}
exports.isOp = isOp;
function isintOp(maybeOp) {
    return maybeOp in int_ops;
}
exports.isintOp = isintOp;
function isboolOp(maybeOp) {
    return maybeOp in bool_ops;
}
exports.isboolOp = isboolOp;
function issameOp(maybeOp) {
    return maybeOp in same_ops;
}
exports.issameOp = issameOp;
function isuniOp(maybeOp) {
    return maybeOp in uni_ops;
}
exports.isuniOp = isuniOp;
