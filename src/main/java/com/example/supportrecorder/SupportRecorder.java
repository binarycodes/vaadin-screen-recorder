package com.example.supportrecorder;

import com.vaadin.flow.component.AbstractSinglePropertyField;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;

@Tag("support-recorder")
@JsModule("./src/support-recorder.ts")
public class SupportRecorder extends AbstractSinglePropertyField<SupportRecorder, String> {

    public SupportRecorder() {
        super("status", "idle", false);
    }

    public void start() {
        getElement().callJsFunction("start");
    }

    public void stopAndDownload(String filename) {
        getElement().callJsFunction("stopAndDownload", filename);
    }

    @ClientCallable
    private void setStatusFromClient(String status) {
        setModelValue(status, true);
    }
}
