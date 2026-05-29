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

function paragraph($, rule, separator) {
    return seq($._paragraph_feed, rule, repeat(seq(separator, rule)), optional(separator))
}

function mono_scope($, left, content, right) {
    return seq(
        left, $._scope_start,
        $._paragraph_feed,
        content,
        right, $._scope_end,
    )
}

const identifier = /\+?[\p{XID_Start}]([-\+]?[\p{XID_Continue}])*/;

module.exports = grammar({
    name: "mona",

    externals: $ => [
        $._paragraph_feed,
        $._paragraph_continue,
        $._scope_start,
        $._scope_end,
        $._angle_bracket,
        $._leading_qmark,
    ],

    extras: $ => [
        $._space,
        $._paragraph_continue,
    ],

    conflicts: $ => [
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
            'case',
        ],
        [
            'object',
            'function',
        ],
        [
            'field_capture',
            'parenthetical',
        ],
    ],

    word: $ => $.identifier,

    rules: {
        source_file: $ => repeat(
            $._statement_paragraph,
        ),

        _space: $ => / /,

        _statement_paragraph: $ => paragraph($, $._statement, ';'),

        _statement: $ => choice(
            $.variable_statement,
            $.expression_statement,
            $._statement_item,
        ),

        _statement_item: $ => choice(
            $.function_item,
            $.type_item,
            $.abstract_item,
            $.impl_item,
        ),

        expression_statement: $ => $._expr,

        variable_statement: $ => seq(
            $._expr,
            '=',
            $._expr,
        ),

        _member_paragraph: $ => paragraph($, $._member_item, ','),

        _member_item: $ => choice(
            $.field_item,
            $.variant_item,
            $.rest_item,
            $.function_item,
            $.impl_item,
            $.impl_list_item,
            $.case,
        ),

        field_item: $ => seq(
            '.',
            field('name', $.name),
            optional(seq(
                ':',
                $._type,
            )),
            optional(seq(
                '=',
                $._expr,
            )),
        ),

        variant_item: $ => seq(
            '|',
            field('name', $.name),
            optional(mono_scope($, '(', choice(seq(':', $._type), $._expr), ')')),
            optional(seq(
                '=>',
                field('consequence', $._expr),
            ))
        ),

        rest_item: $ => alias('..', '..'),

        impl_list_item: $ => seq('impl', scope($, '{', $._impl_list_paragraph, '}')),

        _impl_list_paragraph: $ => paragraph($, $.impl, ','),

        impl: $ => $._scoped_name,

        abstract_item: $ => seq(
            'decl',
            $._abstractable_item,
        ),

        _abstractable_item: $ => choice(
            $.function_item,
        ),

        impl_item: $ => seq(
            'impl',
            optional(field('name', $.name)),
            repeat(field('generics', $.generics)),
            $._abstractable_item,
        ),

        function_item: $ => prec(1, seq(
            'fn',
            optional(choice(
                repeat1(field('generics', $.generics)),
                seq(field('name', $.name), repeat(field('generics', $.generics))),
                seq(repeat(field('generics', $.generics)), field('receiver', $.receiver)),
                seq(field('name', $.name), repeat(field('generics', $.generics)), $._space, field('receiver', $.receiver))
            )),
            field('parameters', choice(
                $.simple_parameter,
                $.named_parameters,
            )),
            optional(seq('->', field('return_type', $._type))),
            optional(scope($, '{', $._statement_paragraph, '}')),
        )),

        receiver: $ => seq(
            optional(field('type', $._type)),
            choice(
                '.',
                '|>',
                '<>',
                '<|',
            ),
        ),

        simple_parameter: $ => seq('(', optional($._type), ')'),
        named_parameters: $ => seq('{', sep_list($.named_parameter, ','), '}'),

        named_parameter: $ => seq(field('name', $.name), ':', field('type', $._type)),

        type_item: $ => seq(
            'type',
            field('name', $.name),
            repeat(field('generics', $.generics)),
            optional(choice(
                $.object,
                seq('=', $._type),
            )),
        ),

        generics: $ => scope($, token.immediate('<'), $._generics_paragraph, '>'),

        _generics_paragraph: $ => paragraph($, $._generic, ','),

        _generic: $ => $._type,

        _expr: $ => choice(
            $.integer,
            $.string,
            $.self_value,
            $.it_value,
            $._scoped_name,
            $.variable_binding,
            $.field_capture_expression,
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
            $.function,
        ),

        parenthetical: $ => prec('parenthetical', scope($, '(', $._statement_paragraph, ')')),
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
            prec.left('equality', seq($._expr, choice('!=', '==', '!==', '==='), $._expr)),
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

        case: $ => prec.left('case', seq(
            field('pattern', $._expr),
            '=>',
            optional(field('consequence', $._expr)),
        )),

        variable_binding: $ => prec.left(seq(field('name', $.name), ':', optional(field('type', $._type)))),

        field_capture_expression: $ => prec('field_capture', mono_scope($, '(', seq(
            alias(/\.+/, '.'),
            optional(seq(
                field('name', $.name),
                optional(seq('type', $._type)),
                '=',
            )),
            optional(field('value', $._expr)),
        ), ')')),

        _type: $ => choice(
            $.boolean_type,
            $.self_type,
            $.in_type,
            $.out_type,
            $.it_type,
            $.object,
            $._scoped_name,
        ),

        boolean_type: $ => prec.right(choice(
            seq(field('true', $._type), alias(' ? ', '?'), field('false', $._type)),
            seq(field('true', $._type), '?'),
            seq(alias($._leading_qmark, '?'), field('false', $._type)),
            '?',
        )),

        self_type: $ => alias('Self', 'Self'),
        in_type: $ => seq('In', optional($.name)),
        out_type: $ => seq('Out', optional($.name)),
        it_type: $ => seq('It', optional($.name)),

        self_value: $ => $._self,
        it_value: $ => $._it,

        _self: $ => 'self',
        _it: $ => 'it',

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

        scope_symbol: $ => choice(alias(/\.+/, '.'), '~', '/'),

        name: $ => choice(
            $.identifier,
            seq('`', optional(alias(token.immediate(/([^`]|``)+/), $.identifier)), token.immediate('`')),
        ),

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

        string: $ => seq(
            '"',
            repeat(choice(
                $.string_content,
                $.string_interpolation,
                $.string_escape,
            )),
            '"',
            lit_suffix($),
        ),

        string_content: $ => /[^{"\\]+/,

        string_interpolation: $ => scope($, '{', $._statement_paragraph, '}'),

        string_escape: $ => seq('\\', alias(/./, $.identifier)),
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
