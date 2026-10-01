// @prisma/client declares the Prisma CLI and TypeScript as peer dependencies. pnpm installs
// resolved peers even with --prod, which pulls the CLI, Prisma Studio and React (~250 MB)
// into the runtime image. The generated client needs only `@prisma/client/runtime`; the CLI
// stays a devDependency for `prisma generate` and `prisma migrate`.
function readPackage(pkg) {
  if (pkg.name === '@prisma/client') {
    delete pkg.peerDependencies?.prisma;
    delete pkg.peerDependencies?.typescript;
    delete pkg.peerDependenciesMeta?.prisma;
    delete pkg.peerDependenciesMeta?.typescript;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
