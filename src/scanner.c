#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"

enum TokenType {
    PARAGRAPH_FEED,
    PARAGRAPH_CONTINUE,
    SCOPE_START,
    SCOPE_END,
    ANGLE_BRACKET,
    LEADING_QMARK,
    DIVIDE,
    LESS_THAN,
};

void* tree_sitter_mona_external_scanner_create() {
    Array(unsigned)* stack = ts_malloc(sizeof(Array(unsigned)));
    array_init(stack);
    return stack;
}

void tree_sitter_mona_external_scanner_destroy(void* payload) {
    Array(unsigned)* stack = payload;
    array_delete(stack);
    ts_free(payload);
}

unsigned tree_sitter_mona_external_scanner_serialize(void* payload, char* buffer) {
    Array(unsigned)* stack = payload;
    unsigned len = stack->size * sizeof(unsigned);
    memcpy(buffer, stack->contents, len);
    return len;
}

void tree_sitter_mona_external_scanner_deserialize(void* payload, char const* buffer, unsigned len) {
    Array(unsigned)* stack = payload;
    array_clear(stack);

    unsigned const count = len / sizeof(unsigned);

    array_reserve(stack, count);
    memcpy(stack->contents, buffer, len);
    stack->size = count;
}

static inline bool is_unjoinable_char(int c) {
    return c == ' ' || c == '\r' || c == '\n'
        || c == ')' || c == ']' || c == '}'
        || c == ',' || c == ';';
}

bool tree_sitter_mona_external_scanner_scan(void* payload, TSLexer* lexer, bool const* valid_symbols) {
    Array(unsigned)* stack = payload;


    if (valid_symbols[SCOPE_START]) {
        if (*array_back(stack) != ~1u) {
            array_push(stack, ~1u);
        }
        lexer->result_symbol = SCOPE_START;
        return true;
    }
    
    if (valid_symbols[SCOPE_END]) {
        array_pop(stack);
        lexer->result_symbol = SCOPE_END;
        return true;
    }

    if (valid_symbols[ANGLE_BRACKET] && lexer->lookahead == '<') {
        lexer->advance(lexer, false);
        lexer->result_symbol = ANGLE_BRACKET;
        return true;
    }

    if (!valid_symbols[LEADING_QMARK] && !valid_symbols[PARAGRAPH_FEED] && !valid_symbols[PARAGRAPH_CONTINUE]) {
        return false;
    }

    bool found_ws = false;

    unsigned initial_column = lexer->get_column(lexer);
    while (lexer->lookahead == ' ') {
        found_ws = true;
        lexer->advance(lexer, true);
    }

    if (valid_symbols[LEADING_QMARK] && lexer->lookahead == '?') {
        lexer->advance(lexer, false);
        if (is_unjoinable_char(lexer->lookahead)) {
            return false;
        }
        lexer->result_symbol = LEADING_QMARK;
        return true;
    }

    if (
        valid_symbols[PARAGRAPH_FEED]
        || (
            (valid_symbols[PARAGRAPH_CONTINUE] || valid_symbols[DIVIDE])
            && (found_ws || lexer->lookahead == ' ' || lexer->lookahead == '\r' || lexer->lookahead == '\n')
        )
    )
    {
        bool found_newline = false;
        while (
            lexer->lookahead == ' '
                || lexer->lookahead == '\r'
                || lexer->lookahead == '\n'
        ) {
            found_ws = true;
            if (lexer->lookahead == '\n') {
                found_newline = true;
            }
            lexer->advance(lexer, true);
        }
        const bool unendable = !found_newline && valid_symbols[PARAGRAPH_FEED] && initial_column != 0;

        unsigned indent = lexer->get_column(lexer);

        if (stack->size == 0u) {
            array_push(stack, 0u);
        }
        unsigned* paragraph_indent = array_back(stack);
        if (indent <= *paragraph_indent && *paragraph_indent != ~0u) {
            *paragraph_indent = !unendable ? indent : ~0u;
            lexer->result_symbol = PARAGRAPH_FEED;
            return true;
        } else {
            if (!found_ws) {
                return false;
            }
            if (lexer->lookahead == '/') {
                lexer->advance(lexer, false);
                lexer->result_symbol = DIVIDE;
                return true;
            } else if (lexer->lookahead == '<') {
                lexer->advance(lexer, false);
                lexer->result_symbol = LESS_THAN;
                return true;
            }
            lexer->result_symbol = PARAGRAPH_CONTINUE;
            return true;
        }
    }


    return false;
}