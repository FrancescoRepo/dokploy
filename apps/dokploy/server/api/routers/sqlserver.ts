import {
	checkPortInUse,
	createMount,
	createSqlServer,
	deployRedis,
	execAsync,
	execAsyncRemote,
	findEnvironmentById,
	findProjectById,
	findSqlServerById,
	getAccessibleServerIds,
	getContainerLogs,
	getServiceContainerCommand,
	getWebServerSettings,
	IS_CLOUD,
	rebuildDatabase,
	removeService,
	removeSqlServerById,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateSqlServerById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiChangeSqlServerStatus,
	apiCreateSqlServer,
	apiDeploySqlServer,
	apiFindOneSqlServer,
	apiRebuildSqlServer,
	apiResetSqlServer,
	apiSaveEnvironmentVariablesSqlServer,
	apiSaveExternalPortSqlServer,
	apiUpdateSqlServer,
	DATABASE_PASSWORD_MESSAGE,
	DATABASE_PASSWORD_REGEX,
	environments,
	projects,
	sqlserver as sqlServerTable,
} from "@/server/db/schema";
export const sqlServerRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSqlServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				const webServerSettings = await getWebServerSettings();
				if (
					(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
					!input.serverId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a SqlServer",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				if (input.serverId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.serverId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this server",
						});
					}
				}

				const newSqlServer = await createSqlServer({
					...input,
				});
				await addNewService(ctx, newSqlServer.sqlserverId);

				await createMount({
					serviceId: newSqlServer.sqlserverId,
					serviceType: "sqlserver",
					volumeName: `${newSqlServer.appName}-data`,
					mountPath: "/data",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newSqlServer.sqlserverId,
					resourceName: newSqlServer.appName,
				});
				return newSqlServer;
			} catch (error) {
				throw error;
			}
		}),
	one: protectedProcedure
		.input(apiFindOneSqlServer)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.sqlserverId, "read");

			const sqlserver = await findSqlServerById(input.sqlserverId);
			if (
				sqlserver.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this SqlServer",
				});
			}
			return sqlserver;
		}),

	start: protectedProcedure
		.input(apiFindOneSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const sqlserver = await findSqlServerById(input.sqlserverId);

			if (sqlserver.serverId) {
				await startServiceRemote(sqlserver.serverId, sqlserver.appName);
			} else {
				await startService(sqlserver.appName);
			}
			await updateSqlServerById(input.sqlserverId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			return sqlserver;
		}),
	reload: protectedProcedure
		.input(apiResetSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const sqlserver = await findSqlServerById(input.sqlserverId);
			if (sqlserver.serverId) {
				await stopServiceRemote(sqlserver.serverId, sqlserver.appName);
			} else {
				await stopService(sqlserver.appName);
			}
			await updateSqlServerById(input.sqlserverId, {
				applicationStatus: "idle",
			});

			if (sqlserver.serverId) {
				await startServiceRemote(sqlserver.serverId, sqlserver.appName);
			} else {
				await startService(sqlserver.appName);
			}
			await updateSqlServerById(input.sqlserverId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			return true;
		}),

	stop: protectedProcedure
		.input(apiFindOneSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const sqlserver = await findSqlServerById(input.sqlserverId);
			if (sqlserver.serverId) {
				await stopServiceRemote(sqlserver.serverId, sqlserver.appName);
			} else {
				await stopService(sqlserver.appName);
			}
			await updateSqlServerById(input.sqlserverId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			return sqlserver;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				service: ["create"],
			});
			const sqlserver = await findSqlServerById(input.sqlserverId);

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					sqlserver.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateSqlServerById(input.sqlserverId, {
				externalPort: input.externalPort,
			});
			await deployRedis(input.sqlserverId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			return sqlserver;
		}),
	deploy: protectedProcedure
		.input(apiDeploySqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const sqlserver = await findSqlServerById(input.sqlserverId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			return deployRedis(input.sqlserverId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/redis-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeploySqlServer)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const queue: string[] = [];
			let done = false;

			deployRedis(input.sqlserverId, (log) => {
				queue.push(log);
			})
				.catch(() => {})
				.finally(() => {
					done = true;
				});

			while (!done || queue.length > 0) {
				if (queue.length > 0) {
					yield queue.shift()!;
				} else {
					await new Promise((r) => setTimeout(r, 50));
				}

				if (signal?.aborted) {
					return;
				}
			}
		}),
	changeStatus: protectedProcedure
		.input(apiChangeSqlServerStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});
			const mongo = await findSqlServerById(input.sqlserverId);
			await updateSqlServerById(input.sqlserverId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.sqlserverId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	remove: protectedProcedure
		.input(apiFindOneSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.sqlserverId, "delete");

			const sqlserver = await findSqlServerById(input.sqlserverId);

			if (
				sqlserver.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Redis",
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: sqlserver.sqlserverId,
				resourceName: sqlserver.appName,
			});
			const cleanupOperations = [
				async () => await removeService(sqlserver?.appName, sqlserver.serverId),
				async () => await removeSqlServerById(input.sqlserverId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return sqlserver;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				envVars: ["write"],
			});
			const updatedRedis = await updateSqlServerById(input.sqlserverId, {
				env: input.env,
			});

			if (!updatedRedis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: input.sqlserverId,
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateSqlServer)
		.mutation(async ({ input, ctx }) => {
			const { sqlServerId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, sqlServerId, {
				service: ["create"],
			});
			const sqlserver = await updateSqlServerById(sqlServerId, {
				...rest,
			});

			if (!sqlserver) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating SqlServer",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: sqlServerId,
				resourceName: sqlserver.appName,
			});
			return true;
		}),
	changePassword: protectedProcedure
		.input(
			z.object({
				sqlserverId: z.string().min(1),
				password: z.string().min(1).regex(DATABASE_PASSWORD_REGEX, {
					message: DATABASE_PASSWORD_MESSAGE,
				}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { sqlserverId, password } = input;
			await checkServicePermissionAndAccess(ctx, sqlserverId, {
				service: ["create"],
			});

			const rd = await findSqlServerById(sqlserverId);
			const { appName, serverId, databasePassword } = rd;

			const containerCmd = getServiceContainerCommand(appName);
			const command = `
				CONTAINER_ID=$(${containerCmd})
				if [ -z "$CONTAINER_ID" ]; then
					echo "No running container found for ${appName}" >&2
					exit 1
				fi
				docker exec "$CONTAINER_ID" redis-cli -a '${databasePassword}' CONFIG SET requirepass '${password}'
			`;

			await db.transaction(async (tx) => {
				await tx
					.update(sqlServerTable)
					.set({ databasePassword: password })
					.where(eq(sqlServerTable.sqlserverId, sqlserverId));

				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command, { shell: "/bin/bash" });
				}
			});

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: sqlserverId,
				resourceName: appName,
			});

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				sqlserverId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				service: ["create"],
			});

			const updatedSqlServer = await db
				.update(sqlServerTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(sqlServerTable.sqlserverId, input.sqlserverId))
				.returning()
				.then((res) => res[0]);

			if (!updatedSqlServer) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move sqlserver",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedSqlServer.sqlserverId,
				resourceName: updatedSqlServer.appName,
			});
			return updatedSqlServer;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildSqlServer)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.sqlserverId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.sqlserverId, "redis");
			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.sqlserverId,
			});
			return true;
		}),
	search: protectedProcedure
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				appName: z.string().optional(),
				description: z.string().optional(),
				projectId: z.string().optional(),
				environmentId: z.string().optional(),
				limit: z.number().min(1).max(100).default(20),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const baseConditions = [
				eq(projects.organizationId, ctx.session.activeOrganizationId),
			];
			if (input.projectId) {
				baseConditions.push(eq(environments.projectId, input.projectId));
			}
			if (input.environmentId) {
				baseConditions.push(
					eq(sqlServerTable.environmentId, input.environmentId),
				);
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(sqlServerTable.name, term),
						ilike(sqlServerTable.appName, term),
						ilike(sqlServerTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(
					ilike(sqlServerTable.name, `%${input.name.trim()}%`),
				);
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(sqlServerTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						sqlServerTable.description ?? "",
						`%${input.description.trim()}%`,
					),
				);
			}
			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${sqlServerTable.sqlserverId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						redisId: sqlServerTable.sqlserverId,
						name: sqlServerTable.name,
						appName: sqlServerTable.appName,
						description: sqlServerTable.description,
						environmentId: sqlServerTable.environmentId,
						applicationStatus: sqlServerTable.applicationStatus,
						createdAt: sqlServerTable.createdAt,
					})
					.from(sqlServerTable)
					.innerJoin(
						environments,
						eq(sqlServerTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(sqlServerTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(sqlServerTable)
					.innerJoin(
						environments,
						eq(sqlServerTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),

	readLogs: protectedProcedure
		.input(
			apiFindOneSqlServer.extend({
				tail: z.number().int().min(1).max(10000).default(100),
				since: z
					.string()
					.regex(/^(all|\d+[smhd])$/, "Invalid since format")
					.default("all"),
				search: z
					.string()
					.regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
					.optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.sqlserverId, "read");
			const sqlserver = await findSqlServerById(input.sqlserverId);
			if (
				sqlserver.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this SqlServer",
				});
			}
			return await getContainerLogs(
				sqlserver.appName,
				input.tail,
				input.since,
				input.search,
				sqlserver.serverId,
			);
		}),
});
