Litfile Compiler
=========

This library parses `.lit` files and compiles them into JavaScript.

Litfiles are basically the same as Vue files, if you've ever seen one. Except you don't need to build everything in litfiles because it's Web Components.

As the name suggests, this is designed to work with `LitElement`.

## Installation

  `npm install litfile-compiler`

## Usage

    This package exposes a single API.

    ```js
    import compile from 'litfile-compiler';

    const document = "...";

    const compiled = compile(document).code;
    ```

    Information on the proper structure of a `.lit` file can be found in the root of this repository.


## Contributing

Do not contribute bad code. Do contribute good code.