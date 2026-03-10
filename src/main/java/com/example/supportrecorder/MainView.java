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

        final ScreenRecorder recorder = ScreenRecorder.create();

        recorder.addRecordingStartedListener(event -> Notification.show("Recording started"));
        recorder.addRecordingReadyListener(event -> Notification.show("Recording stopped. Ready to download."));
        recorder.addDownloadCompletedListener(event -> Notification.show("Download completed"));
        recorder.addCaptureCompletedListener(event -> Notification.show("Capture downloaded"));
        recorder.addPermissionDeniedListener(event -> Notification.show("Screen capture denied by user"));
        recorder.addErrorListener(event -> Notification.show("Recording failed"));

        add(
                new H2("Vaadin Support Recording Demo"),
                new Paragraph("Use the floating recorder in the corner. Drag it anywhere, record a session or capture an image, then download the result."),
                recorder
        );
    }
}
