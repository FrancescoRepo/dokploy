import { db } from "@dokploy/server/db";
import {
	type apiCreateSqlServer,
	buildAppName,
	sqlserver,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildSqlServer } from "@dokploy/server/utils/databases/sqlserver";
import { pullImage } from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { validUniqueServerAppName } from "./project";

export type SqlServer = typeof sqlserver.$inferSelect;

export const createSqlServer = async (
	input: z.infer<typeof apiCreateSqlServer>,
) => {
	const appName = buildAppName("sqlserver", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newSqlServer = await db
		.insert(sqlserver)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: generatePassword(),
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newSqlServer) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting redis database",
		});
	}

	return newSqlServer;
};

export const findSqlServerById = async (sqlServerId: string) => {
	const result = await db.query.sqlserver.findFirst({
		where: eq(sqlserver.sqlserverId, sqlServerId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			mounts: true,
			server: true,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Redis not found",
		});
	}
	return result;
};

export const updateSqlServerById = async (
	sqlServerId: string,
	sqlServerData: Partial<SqlServer>,
) => {
	const { appName, ...rest } = sqlServerData;
	const result = await db
		.update(sqlserver)
		.set({
			...rest,
		})
		.where(eq(sqlserver.sqlserverId, sqlServerId))
		.returning();

	return result[0];
};

export const removeSqlServerById = async (sqlServerId: string) => {
	const result = await db
		.delete(sqlserver)
		.where(eq(sqlserver.sqlserverId, sqlServerId))
		.returning();

	return result[0];
};

export const deploySqlServer = async (
	sqlServerId: string,
	onData?: (data: any) => void,
) => {
	const sqlserver = await findSqlServerById(sqlServerId);
	try {
		await updateSqlServerById(sqlServerId, {
			applicationStatus: "running",
		});

		onData?.("Starting sqlserver deployment...");
		if (sqlserver.serverId) {
			await execAsyncRemote(
				sqlserver.serverId,
				`docker pull ${sqlserver.dockerImage}`,
				onData,
			);
		} else {
			await pullImage(sqlserver.dockerImage, onData);
		}

		await buildSqlServer(sqlserver);
		await updateSqlServerById(sqlServerId, {
			applicationStatus: "done",
		});
		onData?.("Deployment completed successfully!");
	} catch (error) {
		onData?.(`Error: ${error}`);
		await updateSqlServerById(sqlServerId, {
			applicationStatus: "error",
		});

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy sqlserver${error}`,
		});
	}
	return sqlserver;
};
