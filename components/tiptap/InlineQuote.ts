// components/tiptap/InlineQuote.ts
import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineQuote: {
      /**
       * Toggle inline quote mark on selection
       */
      toggleInlineQuote: () => ReturnType;
    };
  }
}

const InlineQuote = Mark.create({
  name: "inlineQuote",

  // Mark'lar zaten inline çalışır; ekstra "inline"/"group"/"spanning" vb. alan YOK

  parseHTML() {
    return [
      { tag: "q" },
      { tag: 'span[data-inline-quote="true"]' }, // fallback için
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // <q> semantik olarak doğru; istersen span fallback'ini kullanabilirsin:
    // return ["span", mergeAttributes(HTMLAttributes, { "data-inline-quote": "true" }), 0];
    return ["q", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleInlineQuote:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

export default InlineQuote;
