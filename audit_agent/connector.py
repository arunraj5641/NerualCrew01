"""
connector.py

Opens exactly one read-only session against a target: either SSH (via paramiko)
or a local Docker container (via `docker exec`). Nothing in this module ever
constructs a command from user/rule input -- callers pass in fixed strings
from the collector's allowlist only.

Safety model:
    - No connector method exists to write a file, restart a service, or run
      an interactive/mutating shell. There is only `run(command)`, which
      executes a single fixed command and returns (stdout, stderr, exit_code).
    - Credentials are never logged. Only the target host/container name and
      the command *id* (not full command text with secrets) are logged.
"""

from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass


class ConnectorError(Exception):
    """Raised when a session cannot be established at all (fatal)."""


@dataclass
class CommandResult:
    stdout: str
    stderr: str
    exit_code: int
    duration_s: float


class BaseConnector:
    def connect(self) -> None:
        raise NotImplementedError

    def run(self, command: str, timeout: int = 20) -> CommandResult:
        raise NotImplementedError

    def close(self) -> None:
        pass

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


class SSHConnector(BaseConnector):
    """
    Read-only SSH connector using paramiko.

    Strict host-key checking is ON by default. Passing insecure=True disables
    it -- if you do this, the report generator will print a loud warning in
    the final report explaining exactly that (per Part 6.4 of the handout).
    """

    def __init__(self, host, user, port=22, key_file=None, password=None,
                 insecure=False, connect_timeout=10):
        self.host = host
        self.user = user
        self.port = port
        self.key_file = key_file
        self.password = password
        self.insecure = insecure
        self.connect_timeout = connect_timeout
        self._client = None

    def connect(self) -> None:
        try:
            import paramiko
        except ImportError as e:
            raise ConnectorError(
                "paramiko is not installed. `pip install paramiko` to use the "
                "SSH transport."
            ) from e

        client = paramiko.SSHClient()
        if self.insecure:
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        else:
            client.load_system_host_keys()
            client.set_missing_host_key_policy(paramiko.RejectPolicy())

        try:
            client.connect(
                hostname=self.host,
                port=self.port,
                username=self.user,
                key_filename=self.key_file,
                password=self.password,
                timeout=self.connect_timeout,
                allow_agent=True,
                look_for_keys=bool(self.key_file is None and self.password is None),
            )
        except Exception as e:  # noqa: BLE001 - we deliberately wrap everything
            raise ConnectorError(
                f"Could not establish SSH session to {self.user}@{self.host}:"
                f"{self.port}: {e}"
            ) from e

        self._client = client

    def run(self, command: str, timeout: int = 20) -> CommandResult:
        if self._client is None:
            raise ConnectorError("run() called before connect()")
        start = time.time()
        # Every command is executed as a single fixed, non-interactive string.
        # No PTY is allocated; no stdin is fed; nothing can prompt for input
        # or hang waiting on a TTY.
        stdin, stdout, stderr = self._client.exec_command(
            command, timeout=timeout, get_pty=False
        )
        stdin.close()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
        return CommandResult(out, err, exit_code, time.time() - start)

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


class DockerConnector(BaseConnector):
    """
    Read-only connector against a local Docker container via `docker exec`.
    No -it, no interactive flags, no mounted volumes are created or altered.
    """

    def __init__(self, container, connect_timeout=10, exec_user=None):
        self.container = container
        self.connect_timeout = connect_timeout
        # Optional: run as a non-root user inside the container. Useful for
        # testing graceful UNKNOWN handling on permission-gated checks
        # (e.g. reading /etc/shadow) without a separate broken test image.
        self.exec_user = exec_user

    def connect(self) -> None:
        try:
            proc = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", self.container],
                capture_output=True, text=True, timeout=self.connect_timeout,
            )
        except FileNotFoundError as e:
            raise ConnectorError(
                "docker CLI not found on PATH. Install Docker or use --transport ssh."
            ) from e
        except subprocess.TimeoutExpired as e:
            raise ConnectorError(
                f"Timed out inspecting container '{self.container}'."
            ) from e

        if proc.returncode != 0:
            raise ConnectorError(
                f"Container '{self.container}' not found or docker daemon "
                f"unreachable: {proc.stderr.strip()}"
            )
        if proc.stdout.strip() != "true":
            raise ConnectorError(f"Container '{self.container}' is not running.")

    def run(self, command: str, timeout: int = 20) -> CommandResult:
        start = time.time()
        argv = ["docker", "exec"]
        if self.exec_user:
            argv += ["-u", self.exec_user]
        argv += [self.container, "sh", "-c", command]
        try:
            proc = subprocess.run(
                argv,
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return CommandResult("", "command timed out", 124, time.time() - start)
        return CommandResult(proc.stdout, proc.stderr, proc.returncode,
                              time.time() - start)

    def close(self) -> None:
        pass  # docker exec has no persistent session to tear down
