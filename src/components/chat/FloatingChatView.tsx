import * as React from "react";
const { useState, useRef, useEffect, useCallback, useMemo } = React;
import { createRoot } from "react-dom/client";

import type AgentClientPlugin from "../../plugin";

// Component imports
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { InlineHeader } from "./InlineHeader";
import type { ChatView } from "./ChatView";

// Hooks imports
import { useChatController } from "../../hooks/useChatController";

interface FloatingChatComponentProps {
	plugin: AgentClientPlugin;
	instanceId: string;
	initialExpanded?: boolean;
}

function FloatingChatComponent({ plugin, instanceId, initialExpanded = false }: FloatingChatComponentProps) {

	// ============================================================
	// Chat Controller Hook (Centralized Logic)
	// ============================================================
	const controller = useChatController({
		plugin,
		viewId: `floating-chat-${instanceId}`,
		workingDirectory: undefined, // Let hook determine from vault
	});

	const {
		acpAdapter,
		settings,
		session,
		isSessionReady,
		messages,
		isSending,
		isUpdateAvailable,
		permission,
		mentions,
		autoMention,
		slashCommands,
		sessionHistory,
		activeAgentLabel,
		availableAgents,
		errorInfo,
		handleSendMessage,
		handleStopGeneration,
		handleNewChat,
		handleExportChat,
		handleSwitchAgent,
		handleRestartAgent,
		handleClearError,
		handleOpenHistory,
		handleSetMode,
		handleSetModel,
		inputValue,
		setInputValue,
		attachedImages,
		setAttachedImages,
		restoredMessage,
		handleRestoredMessageConsumed,
	} = controller;

	// ============================================================
	// UI State (View-Specific)
	// ============================================================
	const [isExpanded, setIsExpanded] = useState(initialExpanded);
	const [showInstanceMenu, setShowInstanceMenu] = useState(false);
	const [size, setSize] = useState(settings.floatingWindowSize);
	const [position, setPosition] = useState(() => {
		if (settings.floatingWindowPosition) return settings.floatingWindowPosition;
		return {
			x: window.innerWidth - settings.floatingWindowSize.width - 50,
			y: window.innerHeight - settings.floatingWindowSize.height - 50
		};
	});
	const [isDragging, setIsDragging] = useState(false);
	const dragOffset = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);

	const acpClientRef = useRef(acpAdapter);

	// Mock View for ChatInput/ChatMessages
	const mockView = useMemo(() => {
		return {
			app: plugin.app,
			registerDomEvent: (target: EventTarget, type: string, callback: EventListenerOrEventListenerObject) => {
				target.addEventListener(type, callback);
			},
		};
	}, [plugin.app]);

	// Floating button image source
	const floatingButtonImageSrc = useMemo(() => {
		const img = settings.floatingButtonImage;
		if (!img) return null;
		if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("data:")) {
			return img;
		}
		// Treat as local path
		interface VaultAdapterWithResourcePath {
			getResourcePath?: (path: string) => string;
		}
		return (plugin.app.vault.adapter as VaultAdapterWithResourcePath).getResourcePath?.(img);
	}, [settings.floatingButtonImage, plugin.app.vault.adapter]);

	// Handlers for window management
	const handleOpenNewFloatingChat = useCallback(() => {
		console.log("[FloatingChatView] Opening new floating chat...");
		plugin.openNewFloatingChat(true); // Open expanded
	}, [plugin]);

	const handleCloseWindow = useCallback(() => {
		setIsExpanded(false);
	}, []);

	const handleButtonClick = useCallback(() => {
		const instances = plugin.getFloatingChatInstances();
		if (instances.length > 1) {
			// Multiple instances exist, show menu to select
			setShowInstanceMenu(true);
		} else {
			// Single instance, just expand
			setIsExpanded(true);
		}
	}, [plugin]);

	// Listen for expand requests from other instances
	useEffect(() => {
		const handleExpandRequest = (event: CustomEvent) => {
			if (event.detail.instanceId === instanceId) {
				setIsExpanded(true);
				setShowInstanceMenu(false);
			}
		};

		window.addEventListener(
			"agent-client:expand-floating-chat" as never,
			handleExpandRequest as EventListener,
		);
		return () => {
			window.removeEventListener(
				"agent-client:expand-floating-chat" as never,
				handleExpandRequest as EventListener,
			);
		};
	}, [instanceId]);

	// Sync manual resizing with state
	useEffect(() => {
		if (!isExpanded || !containerRef.current) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				// Only update if significantly different to avoid loops
				if (Math.abs(width - size.width) > 5 || Math.abs(height - size.height) > 5) {
					setSize({ width, height });
				}
			}
		});

		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [isExpanded, size.width, size.height]);

	// Save size to settings
	useEffect(() => {
		const saveSize = async () => {
			if (size.width !== settings.floatingWindowSize.width || size.height !== settings.floatingWindowSize.height) {
				await plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowSize: size
				});
			}
		};

		const timer = setTimeout(() => {
			void saveSize();
		}, 500); // Debounce save
		return () => clearTimeout(timer);
	}, [size, plugin, settings.floatingWindowSize]);

	// Save position to settings
	useEffect(() => {
		const savePosition = async () => {
			if (!settings.floatingWindowPosition ||
				position.x !== settings.floatingWindowPosition.x ||
				position.y !== settings.floatingWindowPosition.y) {
				await plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowPosition: position
				});
			}
		};

		const timer = setTimeout(() => {
			void savePosition();
		}, 500); // Debounce save
		return () => clearTimeout(timer);
	}, [position, plugin, settings.floatingWindowPosition]);

	// ============================================================
	// Dragging Logic (View-Specific)
	// ============================================================
	const onMouseDown = useCallback((e: React.MouseEvent) => {
		if (!containerRef.current) return;
		setIsDragging(true);
		dragOffset.current = {
			x: e.clientX - position.x,
			y: e.clientY - position.y
		};
	}, [position]);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;
			setPosition({
				x: e.clientX - dragOffset.current.x,
				y: e.clientY - dragOffset.current.y
			});
		};

		const onMouseUp = () => {
			setIsDragging(false);
		};

		if (isDragging) {
			window.addEventListener("mousemove", onMouseMove);
			window.addEventListener("mouseup", onMouseUp);
		}

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [isDragging]);

	// ============================================================
	// Render
	// ============================================================
	if (!settings.showFloatingButton) return null;

	// Only show button for the first instance (others are hidden)
	const allInstances = plugin.getFloatingChatInstances();
	const isFirstInstance = allInstances[0] === instanceId;

	// Render button (only from first instance)
	const renderButton = () => {
		if (!isFirstInstance) return null;

		// Show instance selector menu if requested
		if (showInstanceMenu) {
			return (
				<>
					<div
						className="agent-client-floating-button"
						style={floatingButtonImageSrc ? { background: "transparent" } : undefined}
					>
						{floatingButtonImageSrc ? (
							<img src={floatingButtonImageSrc} alt="AI" />
						) : (
							<div className="agent-client-floating-button-fallback">
								<span>AI</span>
							</div>
						)}
					</div>
					<div
						className="agent-client-floating-instance-menu"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="agent-client-floating-instance-menu-header">
							Select session to open
						</div>
						{allInstances.map((id, index) => (
							<div
								key={id}
								className={`agent-client-floating-instance-menu-item ${
									id === instanceId ? "active" : ""
								}`}
							>
								<span
									onClick={() => {
										plugin.expandFloatingChat(id);
										setShowInstanceMenu(false);
									}}
									style={{ flex: 1, cursor: "pointer" }}
								>
									Chat {index + 1} {id === instanceId ? `(${activeAgentLabel})` : ""}
								</span>
								{allInstances.length > 1 && (
									<button
										className="agent-client-floating-instance-menu-close"
										onClick={(e) => {
											e.stopPropagation();
											plugin.closeFloatingChat(id);
											setShowInstanceMenu(false);
										}}
										title="Close session"
									>
										×
									</button>
								)}
							</div>
						))}
						<div className="agent-client-floating-instance-menu-separator" />
						<div
							className="agent-client-floating-instance-menu-item"
							onClick={() => setShowInstanceMenu(false)}
						>
							Cancel
						</div>
					</div>
				</>
			);
		}

		// Always show button from first instance
		return (
			<div
				className="agent-client-floating-button"
				onClick={handleButtonClick}
				style={floatingButtonImageSrc ? { background: "transparent" } : undefined}
			>
				{floatingButtonImageSrc ? (
					<img src={floatingButtonImageSrc} alt="AI" />
				) : (
					<div className="agent-client-floating-button-fallback">
						<span>AI</span>
					</div>
				)}
			</div>
		);
	};

	// If this instance is not expanded, only render button (if first instance)
	if (!isExpanded) {
		return renderButton();
	}

	// If this instance is expanded, render both button and window
	return (
		<>
			{renderButton()}
			<div
				ref={containerRef}
				className="agent-client-floating-window"
				style={{
					left: position.x,
					top: position.y,
					width: size.width,
					height: size.height
				}}
			>
			<div className="agent-client-floating-header" onMouseDown={onMouseDown}>
				<InlineHeader
					variant="floating"
					agentLabel={activeAgentLabel}
					availableAgents={availableAgents}
					currentAgentId={session.agentId}
					isUpdateAvailable={isUpdateAvailable}
					canShowSessionHistory={sessionHistory.canShowSessionHistory}
					hasMessages={messages.length > 0}
					onAgentChange={(agentId) => void handleSwitchAgent(agentId)}
					onNewSession={() => void handleNewChat()}
					onOpenHistory={() => void handleOpenHistory()}
					onExportChat={() => void handleExportChat()}
					onRestartAgent={() => void handleRestartAgent()}
					onOpenNewWindow={handleOpenNewFloatingChat}
					onClose={handleCloseWindow}
				/>
			</div>

			<div className="agent-client-floating-content">
				{floatingButtonImageSrc && (
					<div className="agent-client-code-block-image-container">
						<img
							src={floatingButtonImageSrc}
							alt="Agent"
							className="agent-client-code-block-image"
						/>
					</div>
				)}

				<div className="agent-client-floating-messages-container">
					<ChatMessages
						messages={messages}
						isSending={isSending}
						isSessionReady={isSessionReady}
						isRestoringSession={sessionHistory.loading}
						agentLabel={activeAgentLabel}
						plugin={plugin}
						view={mockView as unknown as ChatView}
						acpClient={acpClientRef.current}
						onApprovePermission={permission.approvePermission}
					/>
				</div>

				<ChatInput
					isSending={isSending}
					isSessionReady={isSessionReady}
					isRestoringSession={sessionHistory.loading}
					agentLabel={activeAgentLabel}
					availableCommands={session.availableCommands || []}
					autoMentionEnabled={settings.autoMentionActiveNote}
					restoredMessage={restoredMessage}
					mentions={mentions}
					slashCommands={slashCommands}
					autoMention={autoMention}
					plugin={plugin}
					view={mockView as unknown as ChatView}
					onSendMessage={handleSendMessage}
					onStopGeneration={handleStopGeneration}
					onRestoredMessageConsumed={handleRestoredMessageConsumed}
					modes={session.modes}
					onModeChange={(modeId) => void handleSetMode(modeId)}
					models={session.models}
					onModelChange={(modelId) => void handleSetModel(modelId)}
					supportsImages={session.promptCapabilities?.image ?? false}
					agentId={session.agentId}
					inputValue={inputValue}
					onInputChange={setInputValue}
					attachedImages={attachedImages}
					onAttachedImagesChange={setAttachedImages}
					errorInfo={errorInfo}
					onClearError={handleClearError}
				/>
			</div>
		</div>
		</>
	);
}
export function mountFloatingChat(plugin: AgentClientPlugin, instanceId: string, initialExpanded = false) {
	const container = document.body.createDiv({ cls: "agent-client-floating-root" });
	const root = createRoot(container);
	root.render(<FloatingChatComponent plugin={plugin} instanceId={instanceId} initialExpanded={initialExpanded} />);
	return { root, container };
}
