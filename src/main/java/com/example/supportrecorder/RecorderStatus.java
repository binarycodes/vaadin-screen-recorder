package com.example.supportrecorder;

public enum RecorderStatus {
    IDLE("idle"),
    RECORDING("recording"),
    READY("ready"),
    DOWNLOADED("downloaded"),
    DENIED("denied"),
    ERROR("error");

    private final String clientValue;

    RecorderStatus(String clientValue) {
        this.clientValue = clientValue;
    }

    public String toClientValue() {
        return this.clientValue;
    }

    public static RecorderStatus fromClientValue(String value) {
        for (final RecorderStatus status : values()) {
            if (status.clientValue.equals(value)) {
                return status;
            }
        }

        throw new IllegalArgumentException("Unknown recorder status: " + value);
    }

    @Override
    public String toString() {
        return this.clientValue;
    }
}
