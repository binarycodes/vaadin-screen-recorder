package io.binarycodes.vaadin.screenrecorder.demo;

import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Paragraph;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

import io.binarycodes.vaadin.screenrecorder.ScreenRecorder;

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

        attachListeners(inlineRecorder, "Inline recorder");
        attachListeners(floatingRecorder, "Floating recorder");

        add(
                new H2("Vaadin Support Recording Demo"),
                new Paragraph("This view shows both variants: an inline recorder with per-instance styling and a floating recorder."),
                new Paragraph("Use either recorder to record a session or capture an image, then save from the preview dialog."),
                inlineRecorder,
                floatingRecorder
        );
    }

    private void attachListeners(ScreenRecorder recorder, String label) {
        recorder.addRecordingStartedListener(e -> Notification.show(label + ": recording started"));
        recorder.addRecordingReadyListener(e -> Notification.show(label + ": recording stopped. Ready to download."));
        recorder.addDownloadCompletedListener(e -> Notification.show(label + ": download completed"));
        recorder.addCaptureCompletedListener(e -> Notification.show(label + ": capture downloaded"));
        recorder.addPermissionDeniedListener(e -> Notification.show(label + ": screen capture denied by user"));
        recorder.addErrorListener(e -> Notification.show(label + ": recording failed"));
    }
}
