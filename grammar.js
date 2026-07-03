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
        $.whitespace,
        $._scope_start,
        $._scope_end,
        $._angle_bracket,
        $._leading_qmark,
        $._divide,
    ],

    extras: $ => [
        $.whitespace,
    ],

    conflicts: $ => [
        [$._type, $._referent],
        [$._type, $._referent, $.field_referent],
        [$._referent, $.field_referent],
        [$._type, $.object_referent],
        [$._type, $.method_referent],
        [$._type, $.self_method_referent],
        [$._type, $.parenthesized_symbol],
        [$._expr, $.parenthesized_symbol],
        [$.parenthetical, $.parenthesized_symbol],
    ],

    precedences: $ => [
        [
            'named-entry',
            'symbolic-entry',
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
            'boolean-type',
            'reference-type',
        ],
        [
            'self-referent',
            'referent',
        ]
    ],

    word: $ => $.identifier,

    rules: {
        source_file: $ => repeat(
            $._statement_paragraph,
        ),

        _statement_paragraph: $ => paragraph($, $._statement, ';'),

        _statement: $ => choice(
            $.variable_statement,
            $.expression_statement,
            $._statement_item,
        ),

        _statement_item: $ => choice(
            $.function_item,
            $.type_item,
            $.extend_item,
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
            //$.case,
        ),

        field_item: $ => seq(
            field('name', $.name),
            optional(seq(
                ':',
                field('type', $._type),
            )),
            optional(seq(
                '=',
                field('value', $._expr),
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

        impl: $ => $._symbol,

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
                seq(field('name', $.name), repeat(field('generics', $.generics)), $.whitespace, field('receiver', $.receiver))
            )),
            field('parameters', choice(
                $.simple_parameter,
                $.object,
            )),
            optional(seq('->', field('return_type', $._type))),
            optional(scope($, '{', $._statement_paragraph, '}')),
        )),

        receiver: $ => prec.left(seq(
            optional(field('type', $._type)),
            choice(
                '.',
                '|>',
                '<>',
                '<|',
            ),
        )),

        simple_parameter: $ => mono_scope($, '(', optional($._type), ')'),

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

        extend_item: $ => seq(
            'extend',
            field('type', $._type),
            field('body', $.object),
        ),

        generics: $ => scope($, token.immediate('<'), $._generics_paragraph, '>'),

        _generics_paragraph: $ => paragraph($, $._generic, ','),

        _generic: $ => $._type,

        _expr: $ => choice(
            $.integer,
            $.string,
            $.self_value,
            $.it_value,
            $._symbol,
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
            $.function,
        ),

        parenthetical: $ => scope($, '(', $._statement_paragraph, ')'),
        function: $ => scope($, '{', $._statement_paragraph, '}'),
        object: $ => scope($, '[', $._member_paragraph, ']'),

        field_expression: $ => prec.left('postfix', seq(field('value', $._expr), '.', field('field', $._symbol))),

        pre_unary_expression: $ => prec.left('prefix', choice(
            seq('-', $._expr),
            seq('!', $._expr),
        )),

        binary_expression: $ => choice(
            prec.left('additive', seq($._expr, choice('+', '-'), $._expr)),
            prec.left('multiplicative', seq($._expr, choice('*', alias($._divide, '/')), $._expr)),
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
            field('method', $._symbol),
            field('argument', $._argument_expr),
        )),

        case: $ => prec.left('case', seq(
            field('pattern', $._expr),
            '=>',
            optional(field('consequence', $._expr)),
        )),

        variable_binding: $ => prec.left(seq(field('name', $.name), ':', optional(field('type', $._type)))),

        _type: $ => choice(
            $.boolean_type,
            $.self_type,
            $.in_type,
            $.out_type,
            $.it_type,
            $.object,
            $._symbol,
            $.reference_type,
        ),

        reference_type: $ => prec('reference-type', seq(
            optional(field('referent', $._referent)),
            '.',
            field('type', $._type),
        )),

        _referent: $ => prec('referent', choice(
            $._symbol,
            $.field_referent,
            //$.self_field_referent,
            $.method_referent,
            $.self_method_referent,
            $.object_referent,
        )),

        field_referent: $ => choice(
            prec.left(seq(
                field('value', $._referent),
                '.',
                field('field', $._symbol),
            )),
            prec('self-referent', seq(
                '.',
                field('field', $._symbol),
            )),
        ),

        

        //self_field_referent: $ => ,

        method_referent: $ => seq(
            field('value', $._referent),
            '.',
            field('method', $._symbol),
            '(', ')',
        ),

        self_method_referent: $ => (seq(
            '.',
            field('method', $._symbol),
            '(', ')',
        )),

        object_referent: $ => seq(
            field('value', $._referent),
            '.',
            field('object', $.object),
        ),

        boolean_type: $ => prec.right('boolean-type', choice(
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

        _symbol: $ => choice(
            $.name,
            $.named_entry,
            $.symbolic_entry,
            $.parenthesized_symbol,
        ),

        parenthesized_symbol: $ => scope($, '(', paragraph($, $._symbol, ','), ')'),

        named_entry: $ => prec('named-entry', seq(
            choice(
                choice(alias($._divide, '/'), '/'),
                seq($.scope_symbol, '/'),
                seq($._symbol, '/'),
            ),
            $.name,
        )),

        symbolic_entry: $ => prec.left('symbolic-entry', seq(
            optional($._symbol),
            '\\',
            $._symbol,
        )),

        scope_symbol: $ => choice(alias(/\.+/, '.'), '~', alias($._divide, '/'), '/'),

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
