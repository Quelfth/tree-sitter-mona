#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"

enum TokenType {
    PARAGRAPH_FEED,
    PARAGRAPH_CONTINUE,
    SCOPE_START,
    SCOPE_END,
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

bool tree_sitter_mona_external_scanner_scan(void* payload, TSLexer* lexer, bool const* valid_symbols) {
    Array(unsigned)* stack = payload;


    if (valid_symbols[SCOPE_START]) {
        if (*array_back(stack) != ~0u) {
            array_push(stack, ~0u);
        }
        lexer->result_symbol = SCOPE_START;
        return true;
    }
    
    if (valid_symbols[SCOPE_END]) {
        array_pop(stack);
        lexer->result_symbol = SCOPE_END;
        return true;
    }

    if (valid_symbols[PARAGRAPH_FEED] || valid_symbols[PARAGRAPH_CONTINUE]) {
        bool found_newline = false;
        while (
            lexer->lookahead == ' '
                || lexer->lookahead == '\r'
                || lexer->lookahead == '\n'
        ) {
            if (lexer->lookahead == '\n') {
                found_newline = true;
            }
            lexer->advance(lexer, true);
        }
        if (!valid_symbols[PARAGRAPH_FEED] && !found_newline) {
            return false;
        }

        unsigned indent = lexer->get_column(lexer);
        if (stack->size == 0u) {
            array_push(stack, 0u);
        }
        unsigned* paragraph_indent = array_back(stack);
        if (indent <= *paragraph_indent) {
            *paragraph_indent = indent;
            lexer->result_symbol = PARAGRAPH_FEED;
            return true;
        } else {
            if (!found_newline) {
                return false;
            }
            lexer->result_symbol = PARAGRAPH_CONTINUE;
            return true;
        }
    }


    return false;
}