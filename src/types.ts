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
