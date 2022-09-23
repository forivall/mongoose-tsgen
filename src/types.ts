declare module "mongoose" {
  // expose the private "tree" data structure and "options"
  interface SchemaTree {
    _id?: SchemaDefinitionProperty<any>;
    [key: string]: SchemaDefinitionProperty<any> | SchemaTree | undefined;
  }
  interface Schema {
    tree: SchemaTree;
    options: SchemaOptions &
      Required<
        Pick<
          SchemaOptions,
          | "strict"
          | "strictQuery"
          | "bufferCommands"
          | "capped"
          | "versionKey"
          | "optimisticConcurrency"
          | "minimize"
          | "autoIndex"
          | "discriminatorKey"
          | "shardKey"
          | "read"
          | "validateBeforeSave"
          | "_id"
          | "id"
          | "typeKey"
        >
      >;
  }
}
import type mongoose from "mongoose";

type _RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};
type KnownKeys<T> = Extract<keyof _RemoveIndex<T>, keyof T>;

type RemoveIndex<T> = T extends never ? never : string extends keyof T ? Pick<T, KnownKeys<T>> : T;
type Empty<K extends keyof any> = { [_ in K]?: never };

type BuiltinSchemaTypes =
  | typeof mongoose.Schema.Types.Number
  | typeof mongoose.Schema.Types.String
  | typeof mongoose.Schema.Types.Boolean
  | typeof mongoose.Schema.Types.Date
  | typeof mongoose.SchemaTypes.Mixed;
export type _AnySchemaDefinitionProperty<T = RemoveIndex<mongoose.SchemaDefinitionProperty<any>>> =
  T extends never
    ? never
    : T &
        Empty<
          Exclude<KnownKeys<mongoose.SchemaTypeOptions<any>> | keyof BuiltinSchemaTypes, keyof T>
        >;
export type AnySchemaDefinitionProperty = _AnySchemaDefinitionProperty;

/**
 * Contains information parsed from ts-morph about various types for each model
 */
export type ModelTypes = {
  [modelName: string]: {
    /** mongoose method function types */
    methods: { [funcName: string]: string };
    /** mongoose static function types */
    statics: { [funcName: string]: string };
    /** mongoose query function types */
    query: { [funcName: string]: string };
    /** mongoose virtual types */
    virtuals: { [virtualName: string]: string };
    schemaVariableName?: string;
    modelVariableName?: string;
    filePath: string;
    /** comments found in the mongoose schema */
    comments: {
      path: string;
      comment: string;
    }[];
  };
};

type UndefinedKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];
type MarkOptional<T, K extends keyof T = UndefinedKeys<T>> =
  Omit<T, K> & Partial<Pick<T, K>>;
type Resolve<T> = { [K in keyof T]: T[K] } & {};
export type Normalize<T> = Resolve<MarkOptional<T>>;
