ALTER TYPE "public"."serviceType" ADD VALUE 'sqlserver';--> statement-breakpoint
CREATE TABLE "sqlserver" (
	"sqlserverId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"password" text NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"args" text[],
	"env" text,
	"memoryReservation" text,
	"memoryLimit" text,
	"cpuReservation" text,
	"cpuLimit" text,
	"externalPort" integer,
	"createdAt" text NOT NULL,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"healthCheckSwarm" json,
	"restartPolicySwarm" json,
	"placementSwarm" json,
	"updateConfigSwarm" json,
	"rollbackConfigSwarm" json,
	"modeSwarm" json,
	"labelsSwarm" json,
	"networkSwarm" json,
	"stopGracePeriodSwarm" bigint,
	"endpointSpecSwarm" json,
	"ulimitsSwarm" json,
	"replicas" integer DEFAULT 1 NOT NULL,
	"environmentId" text NOT NULL,
	"serverId" text,
	CONSTRAINT "sqlserver_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
ALTER TABLE "mount" ADD COLUMN "sqlserverId" text;--> statement-breakpoint
ALTER TABLE "sqlserver" ADD CONSTRAINT "sqlserver_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sqlserver" ADD CONSTRAINT "sqlserver_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount" ADD CONSTRAINT "mount_sqlserverId_sqlserver_sqlserverId_fk" FOREIGN KEY ("sqlserverId") REFERENCES "public"."sqlserver"("sqlserverId") ON DELETE cascade ON UPDATE no action;