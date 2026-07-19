import { relations } from "drizzle-orm";
import { bigint, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { environments } from "./environment";
import { mounts } from "./mount";
import { server } from "./server";
import {
	applicationStatus,
	type EndpointSpecSwarm,
	EndpointSpecSwarmSchema,
	type HealthCheckSwarm,
	HealthCheckSwarmSchema,
	type LabelsSwarm,
	LabelsSwarmSchema,
	type NetworkSwarm,
	NetworkSwarmSchema,
	type PlacementSwarm,
	PlacementSwarmSchema,
	type RestartPolicySwarm,
	RestartPolicySwarmSchema,
	type ServiceModeSwarm,
	ServiceModeSwarmSchema,
	type UlimitsSwarm,
	UlimitsSwarmSchema,
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import {
	APP_NAME_MESSAGE,
	APP_NAME_REGEX,
	encryptedText,
	generateAppName,
} from "./utils";

export const sqlserver = pgTable("sqlserver", {
	sqlserverId: text("sqlserverId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("sqlserver"))
		.unique(),
	description: text("description"),
	databasePassword: text("password").notNull(),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	args: text("args").array(),
	env: encryptedText("env"),
	memoryReservation: text("memoryReservation"),
	memoryLimit: text("memoryLimit"),
	cpuReservation: text("cpuReservation"),
	cpuLimit: text("cpuLimit"),
	externalPort: integer("externalPort"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),
	healthCheckSwarm: json("healthCheckSwarm").$type<HealthCheckSwarm>(),
	restartPolicySwarm: json("restartPolicySwarm").$type<RestartPolicySwarm>(),
	placementSwarm: json("placementSwarm").$type<PlacementSwarm>(),
	updateConfigSwarm: json("updateConfigSwarm").$type<UpdateConfigSwarm>(),
	rollbackConfigSwarm: json("rollbackConfigSwarm").$type<UpdateConfigSwarm>(),
	modeSwarm: json("modeSwarm").$type<ServiceModeSwarm>(),
	labelsSwarm: json("labelsSwarm").$type<LabelsSwarm>(),
	networkSwarm: json("networkSwarm").$type<NetworkSwarm[]>(),
	stopGracePeriodSwarm: bigint("stopGracePeriodSwarm", { mode: "number" }),
	endpointSpecSwarm: json("endpointSpecSwarm").$type<EndpointSpecSwarm>(),
	ulimitsSwarm: json("ulimitsSwarm").$type<UlimitsSwarm>(),
	replicas: integer("replicas").default(1).notNull(),

	environmentId: text("environmentId")
		.notNull()
		.references(() => environments.environmentId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const sqlServerRelations = relations(sqlserver, ({ one, many }) => ({
	environment: one(environments, {
		fields: [sqlserver.environmentId],
		references: [environments.environmentId],
	}),
	mounts: many(mounts),
	server: one(server, {
		fields: [sqlserver.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(sqlserver, {
	sqlserverId: z.string(),
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
	createdAt: z.string(),
	name: z.string().min(1),
	databasePassword: z.string(),
	dockerImage: z.string().default("mcr.microsoft.com/mssql/server:2025-latest"),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.string().optional(),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	environmentId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
	description: z.string().optional(),
	serverId: z.string().optional(),
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
	stopGracePeriodSwarm: z.number().nullable(),
	endpointSpecSwarm: EndpointSpecSwarmSchema.nullable(),
	ulimitsSwarm: UlimitsSwarmSchema.nullable(),
});

export const apiCreateSqlServer = createSchema.pick({
	name: true,
	appName: true,
	databasePassword: true,
	dockerImage: true,
	environmentId: true,
	description: true,
	serverId: true,
});

export const apiFindOneSqlServer = z.object({
	sqlserverId: z.string().min(1),
});

export const apiChangeSqlServerStatus = createSchema
	.pick({
		sqlserverId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesSqlServer = createSchema
	.pick({
		sqlserverId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortSqlServer = createSchema
	.pick({
		sqlserverId: true,
		externalPort: true,
	})
	.required();

export const apiDeploySqlServer = createSchema
	.pick({
		sqlserverId: true,
	})
	.required();

export const apiResetSqlServer = createSchema
	.pick({
		sqlserverId: true,
		appName: true,
	})
	.required();

export const apiUpdateSqlServer = createSchema
	.partial()
	.extend({
		sqlServerId: z.string().min(1),
		dockerImage: z.string().optional(),
	})
	.omit({ serverId: true });

export const apiRebuildSqlServer = createSchema
	.pick({
		sqlserverId: true,
	})
	.required();
