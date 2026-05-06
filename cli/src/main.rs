mod color;
mod commands;
mod connection;
mod flags;
mod install;
mod output;

use serde_json::json;
use std::env;
use std::fs;
use std::process::exit;

#[cfg(unix)]
use libc;

#[cfg(windows)]
use windows_sys::Win32::Foundation::CloseHandle;
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

use commands::{gen_id, parse_command, ParseError};
use connection::{ensure_daemon, get_socket_dir, kill_all_daemons, kill_daemon_by_session, send_command};
use flags::{clean_args, parse_flags};
use install::run_install;
use output::{print_command_help, print_help, print_response, print_version};

fn parse_proxy(proxy_str: &str) -> serde_json::Value {
    let Some(protocol_end) = proxy_str.find("://") else {
        return json!({ "server": proxy_str });
    };
    let protocol = &proxy_str[..protocol_end + 3];
    let rest = &proxy_str[protocol_end + 3..];

    let Some(at_pos) = rest.rfind('@') else {
        return json!({ "server": proxy_str });
    };

    let creds = &rest[..at_pos];
    let server_part = &rest[at_pos + 1..];
    let server = format!("{}{}", protocol, server_part);

    let Some(colon_pos) = creds.find(':') else {
        return json!({
            "server": server,
            "username": creds,
            "password": ""
        });
    };

    json!({
        "server": server,
        "username": &creds[..colon_pos],
        "password": &creds[colon_pos + 1..]
    })
}

fn run_session(args: &[String], session: &str, json_mode: bool) {
    let subcommand = args.get(1).map(|s| s.as_str());

    match subcommand {
        Some("list") => {
            let socket_dir = get_socket_dir();
            let mut sessions: Vec<String> = Vec::new();

            if let Ok(entries) = fs::read_dir(&socket_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    // Look for pid files in socket directory
                    if name.ends_with(".pid") {
                        let session_name = name.strip_suffix(".pid").unwrap_or("");
                        if !session_name.is_empty() {
                            // Check if session is actually running
                            let pid_path = socket_dir.join(&name);
                            if let Ok(pid_str) = fs::read_to_string(&pid_path) {
                                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                                    #[cfg(unix)]
                                    let running = unsafe { libc::kill(pid as i32, 0) == 0 };
                                    #[cfg(windows)]
                                    let running = unsafe {
                                        let handle =
                                            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                                        if handle != 0 {
                                            CloseHandle(handle);
                                            true
                                        } else {
                                            false
                                        }
                                    };
                                    if running {
                                        sessions.push(session_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if json_mode {
                println!(
                    r#"{{"success":true,"data":{{"sessions":{}}}}}"#,
                    serde_json::to_string(&sessions).unwrap_or_default()
                );
            } else if sessions.is_empty() {
                println!("No active sessions");
            } else {
                println!("Active sessions:");
                for s in &sessions {
                    let marker = if s == session {
                        color::cyan("→")
                    } else {
                        " ".to_string()
                    };
                    println!("{} {}", marker, s);
                }
            }
        }
        None | Some(_) => {
            // Just show current session
            if json_mode {
                println!(r#"{{"success":true,"data":{{"session":"{}"}}}}"#, session);
            } else {
                println!("{}", session);
            }
        }
    }
}

fn main() {
    // Ignore SIGPIPE to prevent panic when piping to head/tail
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }

    let args: Vec<String> = env::args().skip(1).collect();
    let flags = parse_flags(&args);
    let clean = clean_args(&args);

    let has_help = args.iter().any(|a| a == "--help" || a == "-h");
    let has_version = args.iter().any(|a| a == "--version" || a == "-V");

    if has_help {
        if let Some(cmd) = clean.get(0) {
            if print_command_help(cmd) {
                return;
            }
        }
        print_help();
        return;
    }

    if has_version {
        print_version();
        return;
    }

    if clean.is_empty() {
        print_help();
        return;
    }

    // Handle install separately
    if clean.get(0).map(|s| s.as_str()) == Some("install") {
        let with_deps = args.iter().any(|a| a == "--with-deps" || a == "-d");
        run_install(with_deps);
        return;
    }

    // Handle session separately (doesn't need daemon)
    if clean.get(0).map(|s| s.as_str()) == Some("session") {
        run_session(&clean, &flags.session, flags.json);
        return;
    }

    // Handle kill separately (doesn't need daemon)
    if clean.get(0).map(|s| s.as_str()) == Some("kill") {
        let kill_all_flag = args.iter().any(|a| a == "--all");
        if kill_all_flag {
            let result = kill_all_daemons();
            if flags.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "success": true,
                        "daemons": result.daemons,
                        "streamServer": result.stream_server
                    })
                );
            } else {
                if !result.daemons.is_empty() {
                    println!("✓ Killed daemons: {}", result.daemons.join(", "));
                } else {
                    println!("✓ No daemons running");
                }
                if result.stream_server {
                    println!("✓ Stream Server killed");
                } else {
                    println!("✓ No Stream Server running");
                }
            }
        } else {
            let killed = kill_daemon_by_session(&flags.session);
            if flags.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "success": true,
                        "session": flags.session,
                        "killed": killed
                    })
                );
            } else if killed {
                println!("✓ Daemon killed (session: {})", flags.session);
            } else {
                println!("✓ No daemon running (session: {})", flags.session);
            }
        }
        return;
    }

    // Handle restart separately (doesn't need daemon)
    if clean.get(0).map(|s| s.as_str()) == Some("restart") {
        let killed = kill_daemon_by_session(&flags.session);
        if flags.json {
            println!(
                "{}",
                serde_json::json!({
                    "success": true,
                    "session": flags.session,
                    "killed": killed
                })
            );
        } else {
            if killed {
                println!("✓ Daemon restarted (session: {})", flags.session);
            } else {
                println!("✓ No daemon was running (session: {})", flags.session);
            }
            println!("  Next command will auto-start a fresh daemon.");
        }
        return;
    }

    // Handle update separately (doesn't need daemon)
    if clean.get(0).map(|s| s.as_str()) == Some("update") {
        let check_only = args.iter().any(|a| a == "--check");
        let version_idx = args.iter().position(|a| a == "--version");
        let target_version = version_idx.and_then(|i| args.get(i + 1)).map(|s| s.as_str());

        let current_version = env!("CARGO_PKG_VERSION");

        let latest_version = match std::process::Command::new("npm")
            .args(["view", "@dyyz1993/agent-browser", "version"])
            .output()
        {
            Ok(output) if output.status.success() => {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            }
            _ => {
                if flags.json {
                    println!(
                        "{}",
                        serde_json::json!({"success": false, "error": "Failed to check for updates"})
                    );
                } else {
                    eprintln!("{} Failed to check for updates. Are you online?", color::error_indicator());
                }
                exit(1);
            }
        };

        if check_only {
            let up_to_date = latest_version == current_version;
            if flags.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "success": true,
                        "current": current_version,
                        "latest": latest_version,
                        "upToDate": up_to_date
                    })
                );
            } else if up_to_date {
                println!("Already up to date (v{})", current_version);
            } else {
                println!("Update available: v{} → v{}", current_version, latest_version);
            }
            return;
        }

        if latest_version == current_version && target_version.is_none() {
            if flags.json {
                println!(
                    "{}",
                    serde_json::json!({"success": true, "current": current_version, "latest": latest_version, "upToDate": true})
                );
            } else {
                println!("Already up to date (v{})", current_version);
            }
            return;
        }

        let install_version = target_version.unwrap_or(&latest_version);

        let _ = kill_daemon_by_session(&flags.session);

        let install_result = std::process::Command::new("npm")
            .args([
                "install",
                "-g",
                &format!("@dyyz1993/agent-browser@{}", install_version),
            ])
            .status();

        match install_result {
            Ok(status) if status.success() => {
                if flags.json {
                    println!(
                        "{}",
                        serde_json::json!({"success": true, "previous": current_version, "installed": install_version})
                    );
                } else {
                    println!("✓ Updated to v{}", install_version);
                }
            }
            _ => {
                if flags.json {
                    println!(
                        "{}",
                        serde_json::json!({"success": false, "error": format!("Failed to install v{}", install_version)})
                    );
                } else {
                    eprintln!(
                        "{} Failed to install v{}. Try: npm install -g @dyyz1993/agent-browser@{}",
                        color::error_indicator(),
                        install_version,
                        install_version
                    );
                }
                exit(1);
            }
        }
        return;
    }

    let cmd = match parse_command(&clean, &flags) {
        Ok(c) => c,
        Err(e) => {
            if flags.json {
                let error_type = match &e {
                    ParseError::UnknownCommand { .. } => "unknown_command",
                    ParseError::UnknownSubcommand { .. } => "unknown_subcommand",
                    ParseError::MissingArguments { .. } => "missing_arguments",
                    ParseError::InvalidValue { .. } => "invalid_value",
                };
                println!(
                    r#"{{"success":false,"error":"{}","type":"{}"}}"#,
                    e.format().replace('\n', " "),
                    error_type
                );
            } else {
                eprintln!("{}", color::red(&e.format()));
            }
            exit(1);
        }
    };

    let daemon_result = match ensure_daemon(
        &flags.session,
        flags.headed,
        flags.executable_path.as_deref(),
        &flags.extensions,
        flags.args.as_deref(),
        flags.user_agent.as_deref(),
        flags.proxy.as_deref(),
        flags.proxy_bypass.as_deref(),
        flags.ignore_https_errors,
        flags.allow_file_access,
        flags.profile.as_deref(),
        flags.state.as_deref(),
        flags.provider.as_deref(),
        flags.device.as_deref(),
    ) {
        Ok(result) => result,
        Err(e) => {
            if flags.json {
                println!(r#"{{"success":false,"error":"{}"}}"#, e);
            } else {
                eprintln!("{} {}", color::error_indicator(), e);
            }
            exit(1);
        }
    };

    // Warn if launch-time options were explicitly passed via CLI but daemon was already running
    // Only warn about flags that were passed on the command line, not those set via environment
    // variables (since the daemon already uses the env vars when it starts).
    if daemon_result.already_running {
        let ignored_flags: Vec<&str> = [
            if flags.cli_executable_path {
                Some("--executable-path")
            } else {
                None
            },
            if flags.cli_extensions {
                Some("--extension")
            } else {
                None
            },
            if flags.cli_profile {
                Some("--profile")
            } else {
                None
            },
            if flags.cli_state {
                Some("--state")
            } else {
                None
            },
            if flags.cli_args {
                Some("--args")
            } else {
                None
            },
            if flags.cli_user_agent {
                Some("--user-agent")
            } else {
                None
            },
            if flags.cli_proxy {
                Some("--proxy")
            } else {
                None
            },
            if flags.cli_proxy_bypass {
                Some("--proxy-bypass")
            } else {
                None
            },
            flags.ignore_https_errors.then(|| "--ignore-https-errors"),
            flags.cli_allow_file_access.then(|| "--allow-file-access"),
        ]
        .into_iter()
        .flatten()
        .collect();

        if !ignored_flags.is_empty() && !flags.json {
            eprintln!(
                "{} {} ignored: daemon already running. Use 'agent-browser close' first to restart with new options.",
                color::warning_indicator(),
                ignored_flags.join(", ")
            );
        }
    }

    // Validate mutually exclusive options
    if flags.cdp.is_some() && flags.provider.is_some() {
        let msg = "Cannot use --cdp and -p/--provider together";
        if flags.json {
            println!(r#"{{"success":false,"error":"{}"}}"#, msg);
        } else {
            eprintln!("\x1b[31m✗\x1b[0m {}", msg);
        }
        exit(1);
    }

    if flags.provider.is_some() && !flags.extensions.is_empty() {
        let msg = "Cannot use --extension with -p/--provider (extensions require local browser)";
        if flags.json {
            println!(r#"{{"success":false,"error":"{}"}}"#, msg);
        } else {
            eprintln!("\x1b[31m✗\x1b[0m {}", msg);
        }
        exit(1);
    }

    // Connect via CDP if --cdp flag is set
    // Accepts either a port number (e.g., "9222") or a full URL (e.g., "ws://..." or "wss://...")
    if let Some(ref cdp_value) = flags.cdp {
        let mut launch_cmd = if cdp_value.starts_with("ws://")
            || cdp_value.starts_with("wss://")
            || cdp_value.starts_with("http://")
            || cdp_value.starts_with("https://")
        {
            // It's a URL - use cdpUrl field
            json!({
                "id": gen_id(),
                "action": "launch",
                "cdpUrl": cdp_value
            })
        } else {
            // It's a port number - validate and use cdpPort field
            let cdp_port: u16 = match cdp_value.parse::<u32>() {
                Ok(p) if p == 0 => {
                    let msg = "Invalid CDP port: port must be greater than 0".to_string();
                    if flags.json {
                        println!(r#"{{"success":false,"error":"{}"}}"#, msg);
                    } else {
                        eprintln!("{} {}", color::error_indicator(), msg);
                    }
                    exit(1);
                }
                Ok(p) if p > 65535 => {
                    let msg = format!(
                        "Invalid CDP port: {} is out of range (valid range: 1-65535)",
                        p
                    );
                    if flags.json {
                        println!(r#"{{"success":false,"error":"{}"}}"#, msg);
                    } else {
                        eprintln!("{} {}", color::error_indicator(), msg);
                    }
                    exit(1);
                }
                Ok(p) => p as u16,
                Err(_) => {
                    let msg = format!(
                        "Invalid CDP value: '{}' is not a valid port number or URL",
                        cdp_value
                    );
                    if flags.json {
                        println!(r#"{{"success":false,"error":"{}"}}"#, msg);
                    } else {
                        eprintln!("{} {}", color::error_indicator(), msg);
                    }
                    exit(1);
                }
            };
            json!({
                "id": gen_id(),
                "action": "launch",
                "cdpPort": cdp_port
            })
        };

        if flags.ignore_https_errors {
            launch_cmd["ignoreHTTPSErrors"] = json!(true);
        }

        let err = match send_command(launch_cmd, &flags.session) {
            Ok(resp) if resp.success => None,
            Ok(resp) => Some(
                resp.error
                    .unwrap_or_else(|| "CDP connection failed".to_string()),
            ),
            Err(e) => Some(e.to_string()),
        };

        if let Some(msg) = err {
            if flags.json {
                println!(r#"{{"success":false,"error":"{}"}}"#, msg);
            } else {
                eprintln!("{} {}", color::error_indicator(), msg);
            }
            exit(1);
        }
    }

    // Launch with cloud provider if -p flag is set
    if let Some(ref provider) = flags.provider {
        let launch_cmd = json!({
            "id": gen_id(),
            "action": "launch",
            "provider": provider
        });

        let err = match send_command(launch_cmd, &flags.session) {
            Ok(resp) if resp.success => None,
            Ok(resp) => Some(
                resp.error
                    .unwrap_or_else(|| "Provider connection failed".to_string()),
            ),
            Err(e) => Some(e.to_string()),
        };

        if let Some(msg) = err {
            if flags.json {
                println!(r#"{{"success":false,"error":"{}"}}"#, msg);
            } else {
                eprintln!("\x1b[31m✗\x1b[0m {}", msg);
            }
            exit(1);
        }
    }

    // Launch headed browser or configure browser options (without CDP or provider)
    if (flags.headed
        || flags.profile.is_some()
        || flags.state.is_some()
        || flags.proxy.is_some()
        || flags.args.is_some()
        || flags.user_agent.is_some()
        || flags.allow_file_access)
        && flags.cdp.is_none()
        && flags.provider.is_none()
    {
        let mut launch_cmd = json!({
            "id": gen_id(),
            "action": "launch",
            "headless": !flags.headed
        });

        let cmd_obj = launch_cmd
            .as_object_mut()
            .expect("json! macro guarantees object type");

        // Add profile path if specified
        if let Some(ref profile_path) = flags.profile {
            cmd_obj.insert("profile".to_string(), json!(profile_path));
        }

        // Add state path if specified
        if let Some(ref state_path) = flags.state {
            cmd_obj.insert("storageState".to_string(), json!(state_path));
        }

        if let Some(ref proxy_str) = flags.proxy {
            let mut proxy_obj = parse_proxy(proxy_str);
            // Add bypass if specified
            if let Some(ref bypass) = flags.proxy_bypass {
                if let Some(obj) = proxy_obj.as_object_mut() {
                    obj.insert("bypass".to_string(), json!(bypass));
                }
            }
            cmd_obj.insert("proxy".to_string(), proxy_obj);
        }

        if let Some(ref ua) = flags.user_agent {
            cmd_obj.insert("userAgent".to_string(), json!(ua));
        }

        if let Some(ref a) = flags.args {
            // Parse args (comma or newline separated)
            let args_vec: Vec<String> = a
                .split(&[',', '\n'][..])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            cmd_obj.insert("args".to_string(), json!(args_vec));
        }

        if flags.ignore_https_errors {
            launch_cmd["ignoreHTTPSErrors"] = json!(true);
        }

        if flags.allow_file_access {
            launch_cmd["allowFileAccess"] = json!(true);
        }

        match send_command(launch_cmd, &flags.session) {
            Ok(resp) if !resp.success => {
                // Launch command failed (e.g., invalid state file, profile error)
                let error_msg = resp
                    .error
                    .unwrap_or_else(|| "Browser launch failed".to_string());
                if flags.json {
                    println!(r#"{{"success":false,"error":"{}"}}"#, error_msg);
                } else {
                    eprintln!("{} {}", color::error_indicator(), error_msg);
                }
                exit(1);
            }
            Err(e) => {
                if flags.json {
                    println!(r#"{{"success":false,"error":"{}"}}"#, e);
                } else {
                    eprintln!(
                        "{} Could not configure browser: {}",
                        color::error_indicator(),
                        e
                    );
                }
                exit(1);
            }
            Ok(_) => {
                // Launch succeeded
            }
        }
    }

    match send_command(cmd.clone(), &flags.session) {
        Ok(resp) => {
            let success = resp.success;
            // Extract action for context-specific output handling
            let action = cmd.get("action").and_then(|v| v.as_str());
            print_response(&resp, flags.json, action);
            if !success {
                exit(1);
            }
        }
        Err(e) => {
            if flags.json {
                println!(r#"{{"success":false,"error":"{}"}}"#, e);
            } else {
                eprintln!("{} {}", color::error_indicator(), e);
            }
            exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_proxy_simple() {
        let result = parse_proxy("http://proxy.com:8080");
        assert_eq!(result["server"], "http://proxy.com:8080");
        assert!(result.get("username").is_none());
        assert!(result.get("password").is_none());
    }

    #[test]
    fn test_parse_proxy_with_auth() {
        let result = parse_proxy("http://user:pass@proxy.com:8080");
        assert_eq!(result["server"], "http://proxy.com:8080");
        assert_eq!(result["username"], "user");
        assert_eq!(result["password"], "pass");
    }

    #[test]
    fn test_parse_proxy_username_only() {
        let result = parse_proxy("http://user@proxy.com:8080");
        assert_eq!(result["server"], "http://proxy.com:8080");
        assert_eq!(result["username"], "user");
        assert_eq!(result["password"], "");
    }

    #[test]
    fn test_parse_proxy_no_protocol() {
        let result = parse_proxy("proxy.com:8080");
        assert_eq!(result["server"], "proxy.com:8080");
        assert!(result.get("username").is_none());
    }

    #[test]
    fn test_parse_proxy_socks5() {
        let result = parse_proxy("socks5://proxy.com:1080");
        assert_eq!(result["server"], "socks5://proxy.com:1080");
        assert!(result.get("username").is_none());
    }

    #[test]
    fn test_parse_proxy_socks5_with_auth() {
        let result = parse_proxy("socks5://admin:secret@proxy.com:1080");
        assert_eq!(result["server"], "socks5://proxy.com:1080");
        assert_eq!(result["username"], "admin");
        assert_eq!(result["password"], "secret");
    }

    #[test]
    fn test_parse_proxy_complex_password() {
        let result = parse_proxy("http://user:p@ss:w0rd@proxy.com:8080");
        assert_eq!(result["server"], "http://proxy.com:8080");
        assert_eq!(result["username"], "user");
        assert_eq!(result["password"], "p@ss:w0rd");
    }
}
