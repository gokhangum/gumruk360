import Image from "@tiptap/extension-image";

export const FloatImage = Image.extend({
  name: "image",
  selectable: true,

  addAttributes() {
    return {
      // Üst eklentideki (Image) var olan attribute'ları koru
      ...(this.parent?.() || {}),

      float: {
        // "left" | "right" | "none"
        default: "none",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-float") || "none",
        renderHTML: (attrs: any) => {
          const classes = ["tiptap-image"];
          if (attrs.float && attrs.float !== "none") {
            classes.push(`float-${attrs.float}`);
          }
          return {
            "data-float": attrs.float || "none",
            class: classes.join(" "),
          };
        },
      },

      width: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("width"),
        renderHTML: (attrs: any) =>
          attrs.width ? { width: String(attrs.width) } : {},
      },

      alt: {
        default: null as string | null,
      },
    };
  },

  addCommands() {
    const parent = this.parent?.() || {};
    return {
      ...parent,
      setImageFloat:
        (float: "left" | "right" | "none") =>
        ({ commands }: any) =>
          commands.updateAttributes("image", { float }),
    };
  },
});
