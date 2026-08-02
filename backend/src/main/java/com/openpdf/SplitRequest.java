package com.openpdf;

import java.util.List;

public class SplitRequest {
    private String path;
    private List<Integer> splitPoints;

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public List<Integer> getSplitPoints() { return splitPoints; }
    public void setSplitPoints(List<Integer> splitPoints) { this.splitPoints = splitPoints; }
}