import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, /^hljs(-[\w-]+)?$/],
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      ["className", /^language-./, /^hljs(-[\w-]+)?$/],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", /^hljs(-[\w-]+)?$/],
    ],
    table: [...(defaultSchema.attributes?.table ?? []), ["className"]],
    th: [...(defaultSchema.attributes?.th ?? []), ["className"]],
    td: [...(defaultSchema.attributes?.td ?? []), ["className"]],
  },
};

export { rehypeSanitize, markdownSanitizeSchema };
