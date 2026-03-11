package com.example.supportrecorder;

import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Paragraph;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route("")
@PageTitle("Support Recorder Demo")
public class MainView extends VerticalLayout {

    public MainView() {
        setSpacing(true);
        setPadding(true);

        final ScreenRecorder inlineRecorder = ScreenRecorder.create();
        inlineRecorder.setStatusVisible(false);
        inlineRecorder.getStyle().set("--screen-recorder-shell-background", "transparent");
        inlineRecorder.getStyle().set("--screen-recorder-shell-border", "1px solid var(--vaadin-text-color)");
        inlineRecorder.getStyle().set("--screen-recorder-text-color", "var(--lumo-body-text-color)");
        inlineRecorder.getStyle().set("--screen-recorder-muted-text-color", "var(--lumo-secondary-text-color)");

        final ScreenRecorder floatingRecorder = ScreenRecorder.create().asFloating();

        inlineRecorder.addRecordingStartedListener(event -> Notification.show("Inline recorder: recording started"));
        inlineRecorder.addRecordingReadyListener(event -> Notification.show("Inline recorder: recording stopped. Ready to download."));
        inlineRecorder.addDownloadCompletedListener(event -> Notification.show("Inline recorder: download completed"));
        inlineRecorder.addCaptureCompletedListener(event -> Notification.show("Inline recorder: capture downloaded"));
        inlineRecorder.addPermissionDeniedListener(event -> Notification.show("Inline recorder: screen capture denied by user"));
        inlineRecorder.addErrorListener(event -> Notification.show("Inline recorder: recording failed"));

        floatingRecorder.addRecordingStartedListener(event -> Notification.show("Floating recorder: recording started"));
        floatingRecorder.addRecordingReadyListener(event -> Notification.show("Floating recorder: recording stopped. Ready to download."));
        floatingRecorder.addDownloadCompletedListener(event -> Notification.show("Floating recorder: download completed"));
        floatingRecorder.addCaptureCompletedListener(event -> Notification.show("Floating recorder: capture downloaded"));
        floatingRecorder.addPermissionDeniedListener(event -> Notification.show("Floating recorder: screen capture denied by user"));
        floatingRecorder.addErrorListener(event -> Notification.show("Floating recorder: recording failed"));

        add(
                new H2("Vaadin Support Recording Demo"),
                new Paragraph("This view shows both variants: an inline recorder with per-instance styling and a floating recorder."),
                new Paragraph("Use either recorder to record a session or capture an image, then save from the preview dialog."),
                inlineRecorder,
                floatingRecorder
        );
    }
}
