from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("actions/", views.actions_view, name="actions"),
    path("api/predict/", views.predict_view, name="predict"),
    path("api/predict_action/", views.predict_action_view, name="predict_action"),
    path("api/actions/", views.api_actions_list, name="api_actions_list"),
    path("api/info/", views.api_info, name="api_info"),
    path("api/dictionary/", views.api_dictionary, name="api_dictionary"),
]
