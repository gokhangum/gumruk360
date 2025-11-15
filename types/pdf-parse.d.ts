declare module 'pdf-parse' {
  const pdfParse: (data: Buffer | Uint8Array, options?: any) => Promise<{ text: string } & Record<string, any>>;
  export default pdfParse;
}
