package com.openpdf;

import java.util.List;

public class OrderRequest {
    private String path;
    private List<Integer> order;

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public List<Integer> getOrder() { return order; }
    public void setOrder(List<Integer> order) { this.order = order; }
}