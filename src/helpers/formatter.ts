import fs from "fs";
import prettier from "prettier";

// I removed ESLINT usage since it doesnt seem to add much value and adds room for bugs.
// If we want to re-add it, we need to add a check to ensure someone has an eslint config before linting files
// and set eslint as an optional dependency

// import { ESLint } from "eslint";

// NOTE: this could be sped up by formatting the generated file string prior to writing (no need to write file then read it again here and re-write it)
const prettifyFiles = async (filePaths: string[]) => {
  const config =
    (await prettier.resolveConfig(process.cwd(), { useCache: true, editorconfig: true })) ?? {};

  const promises = filePaths.map(async (filePath: string) => {
    const ogContent = await fs.promises.readFile(filePath, "utf8");
    const formattedContent = prettier.format(ogContent.toString(), {
      ...config,
      parser: "typescript"
    });
    await fs.promises.writeFile(filePath, formattedContent, "utf8");
  });
  await Promise.all(promises);
};

// const fixFiles = async (_filePaths: string[]) => {
// const eslint = new ESLint({ fix: true });
// const results = await eslint.lintFiles(filePaths);
// await ESLint.outputFixes(results);
// };

export const format = async (filePaths: string[]) => {
  await prettifyFiles(filePaths);
  // await fixFiles(filePaths);
};
