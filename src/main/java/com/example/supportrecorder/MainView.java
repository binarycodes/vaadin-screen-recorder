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

        FloatingSupportRecorder recorder = new FloatingSupportRecorder();

        recorder.addValueChangeListener(event -> {
            String status = event.getValue();
            switch (status) {
                case "recording" -> Notification.show("Recording started");
                case "ready" -> Notification.show("Recording stopped. Ready to download.");
                case "downloaded" -> Notification.show("Recording downloaded");
                case "denied" -> Notification.show("Screen capture denied by user");
                case "error" -> Notification.show("Recording failed");
                default -> {
                    // no-op
                }
            }
        });

        add(
            new H2("Vaadin Support Recording Demo"),
            new Paragraph("Use the floating recorder in the corner. Drag it anywhere, start or stop capture, then download the finished .webm file."),
            recorder
        );
    }
}
