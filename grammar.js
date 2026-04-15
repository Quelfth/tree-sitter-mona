/**
 * @file Mona grammar for tree-sitter
 * @author Quelfth
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

function scope($, left, paragraph, right) {
    return seq(
        left, $._scope_start,
        repeat(paragraph),
        optional($._paragraph_feed),
        right, $._scope_end,
    )
}

function sep_list1(rule, separator) {
    return seq(
        rule,
        repeat(seq(separator, rule)),
        optional(separator),
    )
}

function sep_list(rule, separator) {
    return optional(sep_list1(rule, separator))
}

function paragraph($, rule) {
    return seq($._paragraph_feed, rule, repeat(seq(';', rule)))
}

const identifier = /\+?[\p{XID_Start}]([-\+]?[\p{XID_Continue}])*/;

module.exports = grammar({
    name: "mona",

    externals: $ => [
        $._paragraph_feed,
        $._paragraph_continue,
        $._scope_start,
        $._scope_end,
    ],

    extras: $ => [
        / /,
        $._paragraph_continue,
    ],

    conflicts: $ => [
        [$._statement, $._member_item],
        [$._statement_item, $._member_item],
    ],

    precedences: $ => [
        [
            'scope',
            'method',
            'postfix',
            'prefix',
            'multiplicative',
            'additive',
            'comparison',
            'equality',
            'logical',
        ],
        [
            'object',
            'function',
        ]
    ],

    word: $ => $.identifier,

    rules: {
        source_file: $ => repeat(
            $._statement_paragraph,
        ),

        _statement_paragraph: $ => paragraph($, $._statement),

        _statement: $ => choice(
            $.variable_statement,
            $.expression_statement,
            $._statement_item,
        ),

        _statement_item: $ => choice(
            $.function_item,
        ),

        expression_statement: $ => $._expr,

        variable_statement: $ => seq(
            $._expr,
            '=',
            $._expr,
        ),

        _member_paragraph: $ => paragraph($, $._member_item),

        _member_item: $ => choice(
            alias($.variable_statement, $.field_item),
            $.function_item,
        ),

        function_item: $ => seq(
            'fn',
            optional(field('name', $.name)),
            field('parameters', choice(
                $.simple_parameter,
                $.named_parameters,
            )),
            optional(seq('->', field('return_type', $._type))),
            scope($, '{', $._statement_paragraph, '}'),
        ),

        simple_parameter: $ => seq('(', optional($._type), ')'),
        named_parameters: $ => seq('{', sep_list($.named_parameter, ','), '}'),

        named_parameter: $ => seq($.name, ':', $._type),

        _expr: $ => choice(
            $.integer,
            $.it_value,
            $._scoped_name,
            $.variable_binding,
            $.parenthetical,
            $.function,
            $.object,
            $.field_expression,
            $.call_expression,
            $.method_call_expression,
            $.pre_unary_expression,
            $.binary_expression,
        ),

        _argument_expr: $ => choice(
            $.parenthetical,
            $.object,
        ),

        parenthetical: $ => scope($, '(', $._statement_paragraph, ')'),
        function: $ => prec('function', scope($, '{', $._statement_paragraph, '}')),
        object: $ => prec('object', scope($, '{', $._member_paragraph, '}')),

        field_expression: $ => prec.left('postfix', seq(field('value', $._expr), '.', field('field', $._scoped_name))),

        pre_unary_expression: $ => prec.left('prefix', choice(
            seq('-', $._expr),
            seq('!', $._expr),
        )),

        binary_expression: $ => choice(
            prec.left('additive', seq($._expr, choice('+', '-'), $._expr)),
            prec.left('multiplicative', seq($._expr, choice('*', '/'), $._expr)),
            prec.left('comparison', seq($._expr, choice('<', '>', '<=', '>='), $._expr)),
            prec.left('equality', seq($._expr, choice('!=', '=='), $._expr)),
            prec.left('logical', seq($._expr, choice('&', '|'), $._expr)),
        ),

        call_expression: $ => prec.left('postfix', seq(
            field('function', $._expr),
            field('argument', $._argument_expr),
        )),

        method_call_expression: $ => prec.left('method', seq(
            field('value', $._expr),
            '.',
            field('method', $._scoped_name),
            field('argument', $._argument_expr),
        )),

        variable_binding: $ => prec.left(seq(field('name', $.name), ':', optional(field('type', $._type)))),

        _type: $ => choice(
            $._scoped_name,
        ),

        it_value: $ => 'it',

        _scoped_name: $ => choice(
            $.name,
            $.scoped_name,
        ),

        scoped_name: $ => prec('scope', seq(
            choice(
                '/',
                seq(
                    choice(
                        $.scope_symbol,
                        $._scoped_name,
                    ),
                    token.immediate('/'),
                ),
            ),
            $.name
        )),

        scope_symbol: $ => choice('.', '~', '/'),

        name: $ => $.identifier,
        identifier: $ => identifier,

        integer: $ => choice(
            seq(choice(
                alias(/[0-9]+/, $.digits),
                seq('-', immediate($.digits, /[0-9]+/)),
            ), lit_suffix($)),
            seq(opt_imm('-', '0x'), immediate($.digits, /[0-9a-f_]+/), lit_suffix($)),
            seq(opt_imm('-', '0b'), immediate($.digits, /[01_]+/), lit_suffix($)),
            seq(opt_imm('-', '0o'), immediate($.digits, /[0-7_]+/), lit_suffix($)),
            seq(opt_imm('-', '0z'), immediate($.digits, /[0-9a-zA-Z+/_]+/), lit_suffix($)),
        ),
    }
});

function opt_imm(opt, next) {
    return choice(
        next,
        seq(opt, token.immediate(next)),
    )
}

function immediate(name, re) {
    return alias(token.immediate(re), name)
}

function lit_suffix($) {
    return optional(alias(token.immediate(seq(':', identifier)), $.literal_suffix))
}
