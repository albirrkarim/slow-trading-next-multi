import { Button, Paper, Stack, Typography } from "@mui/material";
import DialogBlur from "@/components/ui/DialogBlur";
import type {
  NotificationChannel,
  NotificationTypeConfig,
  SlowNotificationKey,
} from "@/lib/notification/config";
import { SLOW_NOTIFICATION_TYPE_INFO } from "@/lib/notification/config";
import notificationExamples from "@/lib/notification/examples";

export interface NotificationExampleSelection {
  channel: NotificationChannel;
  params?: NotificationTypeConfig["params"];
  type: SlowNotificationKey;
}

export default function NotificationExampleDialog(props: {
  onClose: () => void;
  selection: NotificationExampleSelection | null;
}) {
  const { onClose, selection } = props;
  const info = selection ? SLOW_NOTIFICATION_TYPE_INFO[selection.type] : null;
  const example = selection
    ? notificationExamples.get(selection.type, selection.params)
    : null;

  return (
    <DialogBlur
      id="notification-example-dialog"
      maxWidth="sm"
      onClose={onClose}
      open={Boolean(selection)}
      title={`${info?.label ?? "Notification"} example`}
    >
      <Stack spacing={2} sx={{ p: 1 }}>
        <Typography color="text.secondary" variant="body2">
          This is representative content for{" "}
          {selection?.channel ?? "the selected channel"}. Live values will
          replace the example data, and the configured app name may be added to
          the title. Opening this preview does not send a notification.
        </Typography>

        <Stack spacing={0.75}>
          <Typography color="text.secondary" fontWeight={700} variant="caption">
            TITLE
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography fontWeight={700}>{example?.title}</Typography>
          </Paper>
        </Stack>

        <Stack spacing={0.75}>
          <Typography color="text.secondary" fontWeight={700} variant="caption">
            MESSAGE
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.8125rem",
                m: 0,
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
              }}
            >
              {example?.message}
            </Typography>
          </Paper>
        </Stack>

        <Stack alignItems="center" direction="row" justifyContent="flex-end">
          <Button onClick={onClose}>Close</Button>
        </Stack>
      </Stack>
    </DialogBlur>
  );
}
