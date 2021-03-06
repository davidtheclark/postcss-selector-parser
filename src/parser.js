'use strict';

import Root from './selectors/root';
import Selectors from './selectors/selectors';
import ClassName from './selectors/className';
import Comment from './selectors/comment';
import ID from './selectors/id';
import Tag from './selectors/tag';
import Pseudo from './selectors/pseudo';
import Attribute from './selectors/attribute';
import Universal from './selectors/universal';

import sortAsc from './sortAscending';
import tokenize from './tokenize';

import flatten from 'flatten';
import indexesOf from 'indexes-of';
import uniq from 'uniq';

export default class Parser {
    constructor (input) {
        this.input = input;
        this.position = 0;
        this.root = new Root();

        let selectors = new Selectors();
        this.root.append(selectors);

        this.current = selectors;
        this.tokens = tokenize(input);

        return this.parse();
    }

    attribute () {
        let attribute = '';
        this.position ++;
        while (this.position < this.tokens.length && this.tokens[this.position][0] !== ']') {
            attribute += this.tokens[this.position][1];
            this.position ++;
        }
        if (this.position === this.tokens.length && !~attribute.indexOf(']')) {
            this.error('Expected a closing square bracket.');
        }
        let parts = attribute.split(/((?:[*~^$|]?)=)/);
        let attr = new Attribute({
            attribute: parts[0],
            operator: parts[1],
            value: parts[2]
        });
        if (parts[2]) {
            let insensitive = parts[2].split(/(\s+i\s*?)$/);
            attr.value = insensitive[0];
            if (insensitive[1]) {
                attr.insensitive = true;
                attr.raw.insensitive = insensitive[1];
            }
        }
        this.current.append(attr);
        this.position++;
    }

    combinator () {
        let combinator = '';
        let tokens = this.tokens;
        while ( this.position < tokens.length &&
                tokens[this.position][0] === 'space' ||
                tokens[this.position][0] === 'combinator') {
            combinator += this.tokens[this.position][1];
            this.position ++;
            if (this.position === tokens.length) {
                this.error('Unexpected right hand side combinator.');
            }
        }
        let last = this.current.rules[this.current.rules.length - 1];
        if (!last) {
            this.error('Unexpected left hand side combinator.');
        }
        last.combinator = combinator;
        this.current = last;
    }

    comma () {
        if (this.position === this.tokens.length - 1) {
            this.error('Unexpected trailing comma.');
        }
        let selectors = new Selectors();
        if (!this.inParens) {
            while (!this.current.parent.selectors) {
                this.current = this.current.parent;
            }
        }
        this.current.parent.append(selectors);
        this.current = selectors;
        this.position ++;
    }

    comment () {
        let comment = new Comment({value: this.tokens[this.position][1]});
        this.current.append(comment);
        this.position++;
    }

    error (message) {
        throw new this.input.error(message);
    }

    pseudo () {
        let pseudoStr = '';
        while (this.tokens[this.position][0] === ':') {
            pseudoStr += this.tokens[this.position][1];
            this.position ++;
        }
        if (this.tokens[this.position][0] === 'word') {
            pseudoStr += this.tokens[this.position][1];
            this.position ++;
            let pseudo = new Pseudo({value: pseudoStr});
            if (this.tokens[this.position] && this.tokens[this.position][0] === '(') {
                let balanced = 1;
                let inside = [];
                this.position ++;
                while (this.position < this.tokens.length && balanced) {
                    if (this.tokens[this.position][0] === '(') balanced++;
                    if (this.tokens[this.position][0] === ')') balanced--;
                    if (balanced) {
                        inside.push(this.tokens[this.position]);
                    }
                    this.position ++;
                }
                if (balanced) {
                    this.error('Expected closing parenthesis.');
                }
                let cache = {
                    current: this.current,
                    tokens: this.tokens,
                    position: this.position
                };
                this.position = 0;
                this.tokens = inside;
                this.current = pseudo.parameters;
                while (this.position < this.tokens.length) {
                    switch (this.tokens[this.position][0]) {
                        case 'space':
                            this.space();
                            break;
                        case 'comment':
                            this.comment();
                            break;
                        case '[':
                            this.attribute();
                            break;
                        case 'word':
                            this.word();
                            break;
                        case ':':
                            this.pseudo();
                            break;
                        case ',':
                            this.comma();
                            break;
                        case 'combinator':
                            this.combinator();
                            break;
                    }
                    this.position ++;
                }
                this.current = cache.current;
                this.tokens = cache.tokens;
                this.position = cache.position;
            }
            this.current.append(pseudo);
        } else {
            this.error('Unexpected "' + this.tokens[this.position][0] + '" found.');
        }
    }

    space () {
        let token = this.tokens[this.position];
        // Handle space before and after the selector
        if (this.position === 0 || this.tokens[this.position - 1][0] === ',') {
            this.current.spaces.before = token[1];
            this.position ++;
        } else if (this.position === (this.tokens.length - 1)) {
            this.current.spaces.after = token[1];
            this.position ++;
        } else {
            this.combinator();
        }
    }

    universal () {
        this.current.append(new Universal({value: this.tokens[this.position][1]}));
        this.position ++;
    }

    word () {
        let word = this.tokens[this.position][1];
        let hasClass = indexesOf(word, '.');
        let hasId = indexesOf(word, '#');
        if (hasId.length > 1) {
            this.error('Unexpected "#" found.');
        }
        let indices = sortAsc(uniq(flatten([[0], hasClass, hasId])));
        indices.forEach((ind, i) => {
            let index = indices[i + 1] || word.length;
            let value = word.slice(ind, index);
            if (~hasClass.indexOf(ind)) {
                this.current.append(new ClassName({value: value.slice(1)}));
            } else if (~hasId.indexOf(ind)) {
                this.current.append(new ID({value: value.slice(1)}));
            } else {
                this.current.append(new Tag({value: value}));
            }
        });
        this.position ++;
    }

    parse () {
        while (this.position < this.tokens.length) {
            switch (this.tokens[this.position][0]) {
                case 'space':
                    this.space();
                    break;
                case 'comment':
                    this.comment();
                    break;
                case '[':
                    this.attribute();
                    break;
                case 'word':
                    this.word();
                    break;
                case ':':
                    this.pseudo();
                    break;
                case ',':
                    this.comma();
                    break;
                case '*':
                    this.universal();
                    break;
                case 'combinator':
                    this.combinator();
                    break;
            }
        }
        return this.root;
    }
}
