import { Structures, OptionalKind, StructureKind } from "ts-morph";

type StructureCreator<T extends Structures> = (structure: OptionalKind<T>) => T;
type StructureCreators = {
  [Kind in keyof typeof StructureKind as `create${Kind}`]: StructureCreator<
    Extract<Structures, { kind: typeof StructureKind[Kind] }>
  >;
};

const create: { [kind: string]: (structure: any) => any } = {};
for (const kindName of Object.keys(StructureKind)) {
  const kind = StructureKind[kindName as keyof typeof StructureKind];
  create[kindName] = structure => ({ kind, ...structure });
}
export default create as StructureCreators;
