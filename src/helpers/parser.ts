import mongoose, { SchemaTypeOptions } from "mongoose";
import flatten, { unflatten } from "flat";
import _ from "lodash";
import * as morph from "ts-morph";
import structure from "./create";

import * as templates from "./templates";
import { AnySchemaDefinitionProperty } from "../types";

export const getShouldLeanIncludeVirtuals = (schema: mongoose.Schema) => {
  // Check the toObject options to determine if virtual property should be included.
  // See https://mongoosejs.com/docs/api.html#document_Document-toObject for toObject option documentation.
  const toObjectOptions = schema.options?.toObject ?? {};
  if (
    (!toObjectOptions.virtuals && !toObjectOptions.getters) ||
    (toObjectOptions.virtuals === false && toObjectOptions.getters === true)
  )
    return false;
  return true;
};

const formatKeyEntry = ({
  key,
  val,
  isOptional = false,
  newline = true
}: {
  key: string;
  val: string;
  isOptional?: boolean;
  newline?: boolean;
}) => {
  let line = "";

  if (key) {
    // If the key contains any special characters, we need to wrap it in quotes
    line += /^\w*$/.test(key) ? key : JSON.stringify(key);

    if (isOptional) line += "?";
    line += ": ";
  }
  line += val + ";";
  if (newline) line += "\n";
  return line;
};

export const convertFuncSignatureToType = <T extends morph.ParameteredNodeStructure>(
  funcSignature: T,
  funcType: "methods" | "statics" | "query",
  modelName: string
): T => {
  const thisType =
    funcType === "query"
      ? `${modelName}Query`
      : funcType === "methods"
      ? `${modelName}Document`
      : `${modelName}Model`;

  return {
    ...funcSignature,
    parameters: [{ name: "this", type: thisType }, ...(funcSignature.parameters ?? [])]
  };
};

export const convertToSingular = (str: string) => {
  if (str.endsWith("sses")) {
    // https://github.com/francescov1/mongoose-tsgen/issues/79
    return str.slice(0, -2);
  }

  if (str.endsWith("s") && !str.endsWith("ss")) {
    return str.slice(0, -1);
  }
  return str;
};

const getSubDocName = (path: string, modelName = "") => {
  const subDocName =
    modelName +
    path
      .split(".")
      .map((p: string) => p[0].toUpperCase() + p.slice(1))
      .join("");

  return convertToSingular(subDocName);
};

// TODO: this could be moved to the generator too, not really relevant to parsing
export const parseFunctions = (
  funcs: { [key: string]: (...args: any) => any },
  modelName: string,
  funcType: "methods" | "statics" | "query"
) => {
  const methods: morph.MethodSignatureStructure[] = [];

  Object.keys(funcs).forEach(key => {
    if (["initializeTimestamps"].includes(key)) return;

    const methodStructure = structure.createMethodSignature({
      name: key,
      parameters: [{ name: "args", type: "any[]" }],
      returnType: "any"
    });
    methods.push(convertFuncSignatureToType(methodStructure, funcType, modelName));
  });

  return methods;
};

const BASE_TYPES = [
  Object,
  String,
  "String",
  Number,
  "Number",
  Boolean,
  "Boolean",
  Date,
  "Date",
  Buffer,
  "Buffer",
  mongoose.Types.Buffer,
  mongoose.Schema.Types.Buffer,
  mongoose.Schema.Types.ObjectId,
  mongoose.Types.ObjectId,
  mongoose.Types.Decimal128,
  mongoose.Schema.Types.Decimal128
];

export const convertBaseTypeToTs = (
  key: string,
  val: AnySchemaDefinitionProperty,
  isDocument: boolean,
  noMongoose = false
) => {
  // NOTE: ideally we check actual type of value to ensure its Schema.Types.Mixed (the same way we do with Schema.Types.ObjectId),
  // but this doesnt seem to work for some reason
  // {} is treated as Mixed
  if (
    val.schemaName === "Mixed" ||
    val.type?.schemaName === "Mixed" ||
    (val.constructor === Object && _.isEmpty(val)) ||
    (val.type?.constructor === Object && _.isEmpty(val.type))
  ) {
    return "any";
  }

  const mongooseType = val.type === Map ? val.of : val.type;
  switch (mongooseType) {
    case String:
    case "String":
    case Number:
    case "Number":
      const enumType = val.enum;
      if (enumType) {
        let values: readonly (string | number | null)[];
        if ((Array.isArray as (arg: any) => arg is readonly any[])(enumType)) {
          values = enumType;
        } else if (Array.isArray(enumType.values)) {
          values = enumType.values;
        } else {
          values = Object.values(enumType);
        }
        if (values.length > 0) {
          const includesNull = values.includes(null);
          const enumValues = values.filter(str => str !== null);
          let enumString = enumValues.map(value => JSON.stringify(value)).join(` | `);
          if (includesNull) enumString += ` | null`;

          return enumString;
        }
      }
      if (mongooseType === "String" || mongooseType === String) {
        return "string";
      }
      return key === "__v" ? undefined : "number";
    case mongoose.Schema.Types.Decimal128:
    case mongoose.Types.Decimal128:
      return isDocument ? "mongoose.Types.Decimal128" : "number";
    case Boolean:
    case "Boolean":
      return "boolean";
    case Date:
    case "Date":
      return "Date";
    case mongoose.Types.Buffer:
    case mongoose.Schema.Types.Buffer:
    case Buffer:
    case "Buffer":
      return isDocument ? "mongoose.Types.Buffer" : "Buffer";
    case mongoose.Schema.Types.ObjectId:
    case mongoose.Types.ObjectId:
    case "ObjectId": // _id fields have type set to the string "ObjectId"
      return noMongoose ? "string" : "mongoose.Types.ObjectId";
    case Object:
      return "any";
    default:
      // this indicates to the parent func that this type is nested and we need to traverse one level deeper
      return "{}";
  }
};

export const parseChildSchemas = ({
  schema,
  isDocument,
  noMongoose,
  modelName
}: {
  schema: mongoose.Schema;
  isDocument: boolean;
  noMongoose: boolean;
  modelName: string;
}) => {
  const flatSchemaTree: any = flatten(schema.tree, { safe: true });
  let childInterfaces = "";

  const processChild = (rootPath: string) => {
    return (child: any) => {
      const path = child.model.path;
      const isSubdocArray = child.model.$isArraySubdocument;
      const name = getSubDocName(path, rootPath);

      child.schema._isReplacedWithSchema = true;
      child.schema._inferredInterfaceName = name;
      child.schema._isSubdocArray = isSubdocArray;

      const requiredValuePath = `${path}.required`;
      if (requiredValuePath in flatSchemaTree && flatSchemaTree[requiredValuePath] === true) {
        child.schema.required = true;
      }

      /**
       * for subdocument arrays, mongoose supports passing `default: undefined` to disable the default empty array created.
       * here we indicate this on the child schema using _isDefaultSetToUndefined so that the parser properly sets the `isOptional` flag
       */
      if (isSubdocArray) {
        const defaultValuePath = `${path}.default`;
        if (defaultValuePath in flatSchemaTree && flatSchemaTree[defaultValuePath] === undefined) {
          child.schema._isDefaultSetToUndefined = true;
        }
      }
      flatSchemaTree[path] = isSubdocArray ? [child.schema] : child.schema;

      // since we now will process this child by using the schema, we can remove any further nested properties in flatSchemaTree
      for (const key in flatSchemaTree) {
        if (key.startsWith(path) && key.length > path.length && key[path.length] === ".") {
          delete flatSchemaTree[key];
        }
      }

      let header = "";
      if (isDocument)
        header += isSubdocArray
          ? templates.getSubdocumentDocs(rootPath, path)
          : templates.getDocumentDocs(rootPath);
      else header += templates.getLeanDocs(rootPath, name);

      header += "\nexport ";

      if (isDocument) {
        header += `type ${name}Document = `;
        if (isSubdocArray) {
          header += "mongoose.Types.Subdocument";
        }
        // not sure why schema doesnt have `tree` property for typings
        else {
          let _idType;
          // get type of _id to pass to mongoose.Document
          // this is likely unecessary, since non-subdocs are not allowed to have option _id: false (https://mongoosejs.com/docs/guide.html#_id)
          if (schema.tree._id)
            _idType = convertBaseTypeToTs("_id", schema.tree._id, true, noMongoose);

          // TODO: this should extend `${name}Methods` like normal docs, but generator will only have methods, statics, etc. under the model name, not the subdoc model name
          // so after this is generated, we should do a pass and see if there are any child schemas that have non-subdoc definitions.
          // or could just wait until we dont need duplicate subdoc versions of docs (use the same one for both embedded doc and non-subdoc)
          header += `mongoose.Document<${_idType ?? "never"}>`;
        }

        header += " & {\n";
      } else header += `type ${name} = {\n`;

      // TODO: this should not circularly call parseSchema
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      childInterfaces += parseSchema({
        schema: child.schema,
        modelName: name,
        header,
        isDocument,
        footer: `}\n\n`,
        noMongoose,
        shouldLeanIncludeVirtuals: getShouldLeanIncludeVirtuals(child.schema)
      });
    };
  };

  schema.childSchemas.forEach(processChild(modelName));

  const schemaTree = unflatten(flatSchemaTree);
  schema.tree = schemaTree as any;

  return childInterfaces;
};

export const getParseKeyFn = (
  isDocument: boolean,
  shouldLeanIncludeVirtuals: boolean,
  noMongoose: boolean
) => {
  return (
    key: string,
    valOriginal: mongoose.SchemaTree | mongoose.SchemaDefinitionProperty<any>
  ): string => {
    // if the value is an object, we need to deepClone it to ensure changes to `val` aren't persisted in parent function
    let val = _.isPlainObject(valOriginal) ? _.cloneDeep(valOriginal) : valOriginal;

    let valType: string | undefined;

    const requiredValue = Array.isArray(val.required) ? val.required[0] : val.required;
    let isOptional = requiredValue !== true;

    let isArray = Array.isArray(val);
    let isUntypedArray = false;
    let isMapOfArray = false;
    /**
     * If _isDefaultSetToUndefined is set, it means this is a subdoc array with `default: undefined`, indicating that mongoose will not automatically
     * assign an empty array to the value. Therefore, isOptional = true. In other cases, isOptional is false since the field will be automatically initialized
     * with an empty array
     */
    const isArrayOuterDefaultSetToUndefined = Boolean(val._isDefaultSetToUndefined);

    // this means its a subdoc
    if (isArray) {
      val = val[0];
      if (val === undefined && val?.type === undefined) {
        isUntypedArray = true;
        isOptional = isArrayOuterDefaultSetToUndefined ?? false;
      } else {
        isOptional = val._isDefaultSetToUndefined ?? false;
      }
    } else if (Array.isArray(val.type)) {
      val.type = val.type[0];
      isArray = true;

      if (val.type === undefined) {
        isUntypedArray = true;
        isOptional = isArrayOuterDefaultSetToUndefined ?? false;
      } else if (val.type.type) {
        /**
         * Arrays can also take the following format.
         * This is used when validation needs to be done on both the element itself and the full array.
         * This format implies `required: true`.
         *
         * ```
         * friends: {
         *   type: [
         *     {
         *       type: Schema.Types.ObjectId,
         *       ref: "User",
         *       validate: [
         *         function(userId: mongoose.Types.ObjectId) { return !this.friends.includes(userId); }
         *       ]
         *     }
         *   ],
         *   validate: [function(val) { return val.length <= 3; } ]
         * }
         * ```
         */
        if (val.type.ref) val.ref = val.type.ref;
        val.type = val.type.type;
        isOptional = false;
      } else {
        // 2dsphere index is a special edge case which does not have an inherent default value of []
        isOptional = val.index === "2dsphere" ? true : isArrayOuterDefaultSetToUndefined;
      }
    }

    if (BASE_TYPES.includes(val)) val = { type: val };

    const isMap = val?.type === Map;

    // // handles maps of arrays as per https://github.com/francescov1/mongoose-tsgen/issues/63
    if (isMap && Array.isArray(val.of)) {
      val.of = val.of[0];
      isMapOfArray = true;
      isArray = true;
    }

    if (val === Array || val?.type === Array || isUntypedArray) {
      // treat Array constructor and [] as an Array<Mixed>
      isArray = true;
      valType = "any";
      isOptional = isArrayOuterDefaultSetToUndefined ?? false;
    } else if (val._inferredInterfaceName) {
      valType = val._inferredInterfaceName + (isDocument ? "Document" : "");
    } else if (val.path && val.path && val.setters && val.getters) {
      // check for virtual properties
      // skip id property
      if (key === "id") return "";

      // if not lean doc and lean docs shouldnt include virtuals, ignore entry
      if (!isDocument && !shouldLeanIncludeVirtuals) return "";

      valType = "any";
      isOptional = false;
    } else if (
      key &&
      [
        "get",
        "set",
        "schemaName",
        "defaultOptions",
        "_checkRequired",
        "_cast",
        "checkRequired",
        "cast",
        "__v"
      ].includes(key)
    ) {
      return "";
    } else if (val.ref) {
      let docRef: string;

      docRef = val.ref.replace(`'`, "");
      if (docRef.includes(".")) {
        docRef = getSubDocName(docRef);
      }

      valType = isDocument
        ? `${docRef}Document["_id"] | ${docRef}Document`
        : `${docRef}["_id"] | ${docRef}`;
    } else {
      // _ids are always required
      if (key === "_id") isOptional = false;
      const convertedType = convertBaseTypeToTs(key, val, isDocument, noMongoose);

      // TODO: we should detect nested types from unknown types and handle differently.
      // Currently, if we get an unknown type (ie not handled) then users run into a "max callstack exceeded error"
      if (convertedType === "{}") {
        const nestedSchema = _.cloneDeep(val);
        valType = "{\n";

        const parseKey = getParseKeyFn(isDocument, shouldLeanIncludeVirtuals, noMongoose);
        Object.keys(nestedSchema).forEach((key: string) => {
          valType += parseKey(key, nestedSchema[key]);
        });

        valType += "}";
        isOptional = false;
      } else {
        valType = convertedType;
      }
    }

    if (!valType) return "";

    if (isMap && !isMapOfArray)
      valType = isDocument ? `mongoose.Types.Map<${valType}>` : `Map<string, ${valType}>`;

    if (isArray) {
      if (isDocument)
        valType = `mongoose.Types.${val._isSubdocArray ? "Document" : ""}Array<` + valType + ">";
      else {
        // if valType includes a space, likely means its a union type (ie "number | string") so lets wrap it in brackets when adding the array to the type
        if (valType.includes(" ")) valType = `(${valType})`;
        valType = `${valType}[]`;
      }
    }

    // a little messy, but if we have a map of arrays, we need to wrap the value after adding the array info
    if (isMap && isMapOfArray)
      valType = isDocument ? `mongoose.Types.Map<${valType}>` : `Map<string, ${valType}>`;

    return formatKeyEntry({ key, val: valType, isOptional });
  };
};

export const parseSchema = ({
  schema: schemaOriginal,
  modelName,
  isDocument,
  header = "",
  footer = "",
  noMongoose = false,
  shouldLeanIncludeVirtuals
}: {
  schema: mongoose.Schema;
  modelName?: string;
  isDocument: boolean;
  header?: string;
  footer?: string;
  noMongoose?: boolean;
  shouldLeanIncludeVirtuals: boolean;
}) => {
  let template = "";
  const schema = _.cloneDeep(schemaOriginal);
  schema.paths;

  if (schema.childSchemas?.length > 0 && modelName) {
    template += parseChildSchemas({ schema, isDocument, noMongoose, modelName });
  }

  schema.paths;

  template += header;

  const schemaTree = schema.tree;

  const parseKey = getParseKeyFn(isDocument, shouldLeanIncludeVirtuals, noMongoose);

  Object.keys(schemaTree).forEach((key: string) => {
    const val = schemaTree[key];
    template += parseKey(key, val);
  });

  template += footer;

  return template;
};

// TODO: rewrite parseSchema, using `schema.paths` instead!
// this lets us leverage mongoose's parsing that it's already done, rather
// than using schema.tree and trying to re-parse the entire schema all over again.
// also, instead of outputting the code as strings, emit ts-morph objects

type Visitor<C, R> = {
  [T in keyof typeof mongoose.Schema.Types]: (
    this: C,
    type: InstanceType<typeof mongoose.Schema.Types[T]>
  ) => R;
};

const schemaTypeNames = Object.keys(mongoose.Schema.Types) as ReadonlyArray<
  keyof typeof mongoose.Schema.Types
>;

export function getSchemaType(type: mongoose.SchemaType) {
  for (const schemaType of schemaTypeNames) {
    if (type instanceof mongoose.Schema.Types[schemaType]) {
      return schemaType;
    }
  }
  throw new Error(`Unknown SchemaType ${type.instance}`);
}

export interface ParsedEnum {
  raw: NonNullable<mongoose.SchemaTypeOptions<any>["enum"]>;
  rawValues: readonly any[] | object;
  values: readonly any[];
}

export function parseEnumOption(type: mongoose.SchemaType): ParsedEnum | undefined {
  const raw = (type.options as mongoose.SchemaTypeOptions<any>).enum;
  if (!raw) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return {
      raw,
      rawValues: raw,
      values: raw
    };
  }
  if (Array.isArray(raw.values)) {
    return {
      raw,
      rawValues: raw.values,
      values: raw.values
    };
  }
  return {
    raw,
    rawValues: raw,
    values: Object.values(raw)
  };
}

class ExaustiveSwitchError extends Error {
  constructor(value: never) {
    super(`Exhaustive switch unexpected value ${value}`);
  }
}

export class MongooseSchemaParser {
  parents: morph.InterfaceDeclarationStructure[] = [];

  visit(schema: mongoose.Schema, prefix: string) {
    this.parents.unshift(schema);
    let prev: readonly string[];
    schema.eachPath((path, type) => {
      if (path.endsWith(".$*")) {
        return;
      }
    });
    this.parents.shift();
  }

  visitOne(schemaType: mongoose.SchemaType) {
    const type = getSchemaType(schemaType);
    switch (type) {
      case "Boolean":
      case "Buffer":
      case "Date":
      case "Decimal128":
      case "ObjectId":
      case "Mixed":
        return { type, schemaType };
      case "String":
      case "Number": {
        return { type, schemaType, enum: parseEnumOption(schemaType) };
      }
      case "Array":
        const { caster } = schemaType as mongoose.Schema.Types.Array;
        return { type: "Array", items: caster && this.visitOne(caster) };
      default:
        throw new ExaustiveSwitchError(type);
    }
  }

  get current() {
    return this.parents[0];
  }
}
export interface MongooseSchemaParser extends Visitor<MongooseSchemaParser, any> {}
