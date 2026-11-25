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
    path("mobile/<str:session_id>/", views.mobile_camera_view, name="mobile_camera"),
    path("api/remote_push/<str:session_id>/", views.api_remote_push, name="api_remote_push"),
    path("api/remote_poll/<str:session_id>/", views.api_remote_poll, name="api_remote_poll"),
]
