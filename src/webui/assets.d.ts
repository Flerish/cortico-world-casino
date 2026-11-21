// 图片经 esbuild 的 dataurl loader 内联成 data: URI 字符串。
declare module '*.jpg' {
  const url: string;
  export default url;
}
declare module '*.png' {
  const url: string;
  export default url;
}
