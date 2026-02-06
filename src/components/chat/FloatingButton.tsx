import * as React from "react";
const { useState, useRef, useEffect, useCallback, useMemo } = React;
import { createRoot, type Root } from "react-dom/client";

import { setIcon } from "obsidian";
import type AgentClientPlugin from "../../plugin";
import { useSettings } from "../../hooks/useSettings";

interface VaultAdapterWithResourcePath {
	getResourcePath?: (path: string) => string;
}

// ============================================================
// FloatingButtonContainer Class
// ============================================================

/**
 * Container that manages the floating button React component lifecycle.
 * Independent from any floating chat view instance.
 */
export class FloatingButtonContainer {
	private root: Root | null = null;
	private containerEl: HTMLElement;

	constructor(private plugin: AgentClientPlugin) {
		this.containerEl = document.body.createDiv({
			cls: "agent-client-floating-button-root",
		});
	}

	mount(): void {
		this.root = createRoot(this.containerEl);
		this.root.render(<FloatingButtonComponent plugin={this.plugin} />);
	}

	unmount(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.containerEl.remove();
	}
}

// ============================================================
// FloatingButtonComponent
// ============================================================

interface FloatingButtonProps {
	plugin: AgentClientPlugin;
}

function FloatingButtonComponent({ plugin }: FloatingButtonProps) {
	const settings = useSettings(plugin);

	const [showInstanceMenu, setShowInstanceMenu] = useState(false);
	const instanceMenuRef = useRef<HTMLDivElement>(null);

	// Floating button image source
	const floatingButtonImageSrc = useMemo(() => {
		const img = settings.floatingButtonImage;
		if (!img) return null;
		if (
			img.startsWith("http://") ||
			img.startsWith("https://") ||
			img.startsWith("data:")
		) {
			return img;
		}
		return (
			plugin.app.vault.adapter as VaultAdapterWithResourcePath
		).getResourcePath?.(img);
	}, [settings.floatingButtonImage, plugin.app.vault.adapter]);

	// Build display labels with duplicate numbering
	const allInstances = plugin.getFloatingChatInstances();

	const instanceLabels = useMemo(() => {
		const views = plugin.viewRegistry.getByType("floating");
		const entries = views.map((v) => ({
			viewId: v.viewId,
			label: v.getDisplayName(),
		}));
		const countMap = new Map<string, number>();
		for (const e of entries) {
			countMap.set(e.label, (countMap.get(e.label) ?? 0) + 1);
		}
		const indexMap = new Map<string, number>();
		return entries.map((e) => {
			if ((countMap.get(e.label) ?? 0) > 1) {
				const idx = (indexMap.get(e.label) ?? 0) + 1;
				indexMap.set(e.label, idx);
				return {
					viewId: e.viewId,
					label: idx === 1 ? e.label : `${e.label} ${idx}`,
				};
			}
			return e;
		});
	}, [plugin.viewRegistry, allInstances]);

	// Button click handler
	const handleButtonClick = useCallback(() => {
		const instances = plugin.getFloatingChatInstances();
		if (instances.length === 0) {
			// No instances, create one and expand
			plugin.openNewFloatingChat(true);
		} else if (instances.length === 1) {
			// Single instance, just expand
			plugin.expandFloatingChat(instances[0]);
		} else {
			// Multiple instances, show menu
			setShowInstanceMenu(true);
		}
	}, [plugin]);

	// Close instance menu on outside click
	useEffect(() => {
		if (!showInstanceMenu) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				instanceMenuRef.current &&
				!instanceMenuRef.current.contains(event.target as Node)
			) {
				setShowInstanceMenu(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [showInstanceMenu]);

	if (!settings.showFloatingButton) return null;

	const buttonClassName = floatingButtonImageSrc
		? "agent-client-floating-button has-custom-image"
		: "agent-client-floating-button";

	return (
		<>
			<div className={buttonClassName} onClick={handleButtonClick}>
				{floatingButtonImageSrc ? (
					<img src={floatingButtonImageSrc} alt="Open chat" />
				) : (
					<div
						className="agent-client-floating-button-fallback"
						ref={(el) => {
							if (el) setIcon(el, "bot-message-square");
						}}
					/>
				)}
			</div>
			{showInstanceMenu && (
				<div
					ref={instanceMenuRef}
					className="agent-client-floating-instance-menu"
				>
					<div className="agent-client-floating-instance-menu-header">
						Select session to open
					</div>
					{instanceLabels.map(({ viewId: id, label }) => (
						<div
							key={id}
							className="agent-client-floating-instance-menu-item"
							onClick={() => {
								plugin.expandFloatingChat(id);
								plugin.viewRegistry.setFocused(id);
								setShowInstanceMenu(false);
							}}
						>
							<span className="agent-client-floating-instance-menu-label">
								{label}
							</span>
							{instanceLabels.length > 1 && (
								<button
									className="agent-client-floating-instance-menu-close"
									onClick={(e) => {
										e.stopPropagation();
										plugin.closeFloatingChat(id);
										if (instanceLabels.length <= 2) {
											setShowInstanceMenu(false);
										}
									}}
									title="Close session"
								>
									×
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</>
	);
}
