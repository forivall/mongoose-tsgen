/* tslint:disable */
/* eslint-disable */

// ######################################## THIS FILE WAS GENERATED BY MONGOOSE-TSGEN ######################################## //

// NOTE: ANY CHANGES MADE WILL BE OVERWRITTEN ON SUBSEQUENT EXECUTIONS OF MONGOOSE-TSGEN.

import mongoose from "mongoose";

declare module "mongoose" {

interface UserFriend {uid: User["_id"] | User;
nickname?: string;
_id: mongoose.Types.ObjectId;
}

interface UserQueries {
populateFriends<Q extends mongoose.DocumentQuery<any, UserDocument, {}>>(this: Q): Q;
}

interface UserMethods {
isMetadataString<D extends UserDocument>(this: D): boolean;
}

interface UserStatics {
getFriends<M extends UserModel>(this: M, friendUids: UserDocument["_id"][]): Promise<any>;
}

interface UserModel extends mongoose.Model<UserDocument, UserQueries>, UserStatics {}

interface User {
email: string;
firstName: string;
lastName: string;
bestFriend?: mongoose.Types.ObjectId;
friends: UserFriend[];
city: {
coordinates?: number[];
};
_id: mongoose.Types.ObjectId;
}

type UserFriendDocument = mongoose.Types.Embedded & {
uid: UserDocument["_id"] | UserDocument;
} & UserFriend

type UserDocument = mongoose.Document & UserMethods & {
metadata?: any;
friends: mongoose.Types.DocumentArray<UserFriendDocument>;
city: {
};
name: any;
} & User

}
