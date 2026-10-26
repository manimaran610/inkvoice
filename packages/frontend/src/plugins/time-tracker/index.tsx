// Time Tracker frontend registration. On import it wires the plugin's surface
// into the OSS registries: a protected route (guarded by PluginGuard), a
// sidebar nav item under the Extensions section, its i18n, and its display
// metadata for the admin Plugins tab.

import { Clock } from "lucide-react";
import { Navigate } from "react-router-dom";
import { registerNavItem } from "@/nav-registry";
import { registerRoute } from "@/route-registry";
import { useAuthStore } from "@/stores/auth.store";
import { PluginGuard } from "../PluginGuard";
import { registerPlugin } from "../registry";
import "./i18n";
import TimeTrackingPage from "./TimeTrackingPage";

const PLUGIN_ID = "time-tracker";

function TimeTrackingRoleGuard() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === "Accountant") return <Navigate to="/" replace />;
  return (
    <PluginGuard pluginId={PLUGIN_ID}>
      <TimeTrackingPage />
    </PluginGuard>
  );
}

registerRoute({
  path: "/time-tracking",
  element: <TimeTrackingRoleGuard />,
  scope: "protected",
});

registerNavItem({
  to: "/time-tracking",
  labelKey: "time_tracker.nav",
  icon: Clock,
  section: "nav.plugins",
  pluginId: PLUGIN_ID,
  hiddenForRoles: ["Accountant"],
});

registerPlugin({
  id: PLUGIN_ID,
  nameKey: "time_tracker.name",
  descriptionKey: "time_tracker.description",
  icon: Clock,
});
