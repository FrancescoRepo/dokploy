import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBox } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const updateSqlServerSchema = z.object({
  name: z.string().min(1, {
    message: "Name is required",
  }),
  description: z.string().optional(),
});

type UpdateSqlServer = z.infer<typeof updateSqlServerSchema>;

interface Props {
  sqlServerId: string;
}

export const UpdateSqlServer = ({ sqlServerId }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const utils = api.useUtils();
  const { mutateAsync, error, isError, isPending } =
    api.sqlserver.update.useMutation();
  const { data } = api.sqlserver.one.useQuery(
    {
      sqlserverId: sqlServerId,
    },
    {
      enabled: !!sqlServerId,
    },
  );
  const form = useForm<UpdateSqlServer>({
    defaultValues: {
      description: data?.description ?? "",
      name: data?.name ?? "",
    },
    resolver: zodResolver(updateSqlServerSchema),
  });
  useEffect(() => {
    if (data) {
      form.reset({
        description: data.description ?? "",
        name: data.name,
      });
    }
  }, [data, form, form.reset]);

  const onSubmit = async (formData: UpdateSqlServer) => {
    await mutateAsync({
      name: formData.name,
      sqlServerId: sqlServerId,
      description: formData.description || "",
    })
      .then(() => {
        toast.success("SqlServer updated successfully");
        utils.sqlserver.one.invalidate({
          sqlserverId: sqlServerId,
        });
        setIsOpen(false);
      })
      .catch(() => {
        toast.error("Error updating SqlServer");
      })
      .finally(() => {});
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <PenBox className="size-3.5 text-primary group-hover:text-blue-500" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modify SqlServer</DialogTitle>
          <DialogDescription>Update the SqlServer data</DialogDescription>
        </DialogHeader>
        {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

        <div className="grid gap-4">
          <div className="grid items-center gap-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                id="hook-form-update-sqlserver"
                className="grid w-full gap-4 "
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Vandelay Industries" {...field} />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Description about your project..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    isLoading={isPending}
                    form="hook-form-update-sqlserver"
                    type="submit"
                    className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    Update
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
