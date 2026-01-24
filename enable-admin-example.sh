#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./enable-admin-example.sh <container_name_or_id> [command] [targets...]

Commands:
  enable    Enable autostart + reload + start (default)
  disable   Stop + disable autostart + reload
  start     Start services
  stop      Stop services
  restart   Restart services
  status    Show status
  set       Make targets the only ones enabled+running (stop+disable others)

Targets:
  both      Manage both services (default)
  example   Manage ds:example only
  admin     Manage ds:adminpanel only
  none      Select nothing (useful with `set` to disable both)

Examples:
  ./enable-admin-example.sh onlyoffice-documentserver enable both
  ./enable-admin-example.sh onlyoffice-documentserver enable example
  ./enable-admin-example.sh onlyoffice-documentserver stop admin
  ./enable-admin-example.sh onlyoffice-documentserver set example   # disable+stop admin
  ./enable-admin-example.sh onlyoffice-documentserver set admin     # disable+stop example
  ./enable-admin-example.sh onlyoffice-documentserver set none      # disable+stop both

What it does:
  - Manage ONLYOFFICE DocumentServer example (/example/) and admin panel (/admin/)

Notes:
  - Many ONLYOFFICE images ship with autostart=false for these services.
  - Changes inside container may be lost after recreating the container.
EOF
}

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

CONTAINER="$1"
COMMAND="${2:-enable}"
shift || true
shift || true

TARGETS=("${@:-both}")

case "$COMMAND" in
  enable|disable|start|stop|restart|status|set) ;;
  *)
    echo "FATAL: unknown command '$COMMAND'"
    usage
    exit 1
    ;;
esac

want_example=false
want_admin=false
for t in "${TARGETS[@]}"; do
  case "$t" in
    both|all)
      want_example=true
      want_admin=true
      ;;
    example)
      want_example=true
      ;;
    admin|adminpanel)
      want_admin=true
      ;;
    none)
      # explicit: keep both false
      ;;
    *)
      echo "FATAL: unknown target '$t'"
      usage
      exit 1
      ;;
  esac
done

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "FATAL: container '$CONTAINER' not found"
  exit 1
fi

echo "==> Using container: $CONTAINER"

CONF_EXAMPLE="/etc/supervisor/conf.d/ds-example.conf"
CONF_ADMINPANEL="/etc/supervisor/conf.d/ds-adminpanel.conf"
SVC_EXAMPLE="ds:example"
SVC_ADMINPANEL="ds:adminpanel"

ensure_conf_exists() {
  local conf="$1"
  docker exec "$CONTAINER" sh -lc "test -f '$conf' || { echo 'Missing: $conf' >&2; exit 1; }"
}

set_autostart() {
  local conf="$1"
  local value="$2" # true|false

  ensure_conf_exists "$conf"

  # best-effort: toggle both directions
  docker exec "$CONTAINER" sh -lc "sed -i 's/autostart=true/autostart=$value/' '$conf' || true"
  docker exec "$CONTAINER" sh -lc "sed -i 's/autostart=false/autostart=$value/' '$conf' || true"
}

supervisor_apply() {
  echo "==> Reloading supervisor config"
  docker exec "$CONTAINER" sh -lc "command -v supervisorctl >/dev/null 2>&1 || { echo 'supervisorctl not found' >&2; exit 1; }"
  docker exec "$CONTAINER" sh -lc "supervisorctl reread"
  docker exec "$CONTAINER" sh -lc "supervisorctl update"
}

svc_action() {
  local action="$1" # start|stop|restart
  local svc="$1"
  svc="$2"

  case "$action" in
    start)
      echo "==> Starting $svc"
      docker exec "$CONTAINER" sh -lc "supervisorctl start '$svc' || true"
      ;;
    stop)
      echo "==> Stopping $svc"
      docker exec "$CONTAINER" sh -lc "supervisorctl stop '$svc' || true"
      ;;
    restart)
      echo "==> Restarting $svc"
      docker exec "$CONTAINER" sh -lc "supervisorctl restart '$svc' || true"
      ;;
  esac
}

status_services() {
  echo "==> Supervisor status (filtered)"
  docker exec "$CONTAINER" sh -lc "supervisorctl status | sed -n '1,200p' | grep -E 'ds:example|ds:adminpanel' || true"
}

enable_selected_autostart() {
  if $want_example; then
    set_autostart "$CONF_EXAMPLE" "true"
  fi
  if $want_admin; then
    set_autostart "$CONF_ADMINPANEL" "true"
  fi
}

disable_selected_autostart() {
  if $want_example; then
    set_autostart "$CONF_EXAMPLE" "false"
  fi
  if $want_admin; then
    set_autostart "$CONF_ADMINPANEL" "false"
  fi
}

svc_action_selected() {
  local action="$1"
  if $want_example; then
    svc_action "$action" "$SVC_EXAMPLE"
  fi
  if $want_admin; then
    svc_action "$action" "$SVC_ADMINPANEL"
  fi
}

svc_action_unselected() {
  local action="$1"
  if ! $want_example; then
    svc_action "$action" "$SVC_EXAMPLE"
  fi
  if ! $want_admin; then
    svc_action "$action" "$SVC_ADMINPANEL"
  fi
}

case "$COMMAND" in
  enable)
    echo "==> Enabling autostart (example=$want_example admin=$want_admin)"
    enable_selected_autostart
    supervisor_apply
    svc_action_selected start
    status_services
    ;;
  disable)
    svc_action_selected stop
    echo "==> Disabling autostart (example=$want_example admin=$want_admin)"
    disable_selected_autostart
    supervisor_apply
    status_services
    ;;
  start)
    svc_action_selected start
    status_services
    ;;
  stop)
    svc_action_selected stop
    status_services
    ;;
  restart)
    svc_action_selected restart
    status_services
    ;;
  status)
    status_services
    ;;
  set)
    echo "==> Setting enabled+running targets (example=$want_example admin=$want_admin)"
    # stop things we don't want first (avoid port conflicts / confusion)
    svc_action_unselected stop

    # set autostart exactly as targets
    if $want_example; then
      set_autostart "$CONF_EXAMPLE" "true"
    else
      set_autostart "$CONF_EXAMPLE" "false"
    fi
    if $want_admin; then
      set_autostart "$CONF_ADMINPANEL" "true"
    else
      set_autostart "$CONF_ADMINPANEL" "false"
    fi

    supervisor_apply
    svc_action_selected start
    status_services
    ;;
esac

cat <<'EOF'

Done.

Direct (DocServer):
  - http://<docserver-host>:8082/example/
  - http://<docserver-host>:8082/admin/
EOF
