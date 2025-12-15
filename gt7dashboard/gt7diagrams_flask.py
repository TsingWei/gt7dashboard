"""
Flask-compatible diagram helpers that don't require Bokeh.
This module contains functions from gt7diagrams that can be used in Flask without Bokeh dependencies.
"""

from gt7dashboard import gt7helper
from gt7dashboard.gt7lap import Lap


def get_fuel_map_html_table(last_lap: Lap) -> str:
    """
    Returns a html table of relative fuel map.
    :param last_lap:
    :return: html table
    """

    fuel_maps = gt7helper.get_fuel_on_consumption_by_relative_fuel_levels(last_lap)
    table = (
        "<table><tr>"
        "<th title='The fuel level relative to the current one'>Fuel Lvl.</th>"
        "<th title='Fuel consumed'>Fuel Cons.</th>"
        "<th title='Laps remaining with this setting'>Laps Rem.</th>"
        "<th title='Time remaining with this setting' >Time Rem.</th>"
        "<th title='Time Diff to last lap with this setting'>Time Diff</th></tr>"
    )
    for fuel_map in fuel_maps:
        no_fuel_consumption = fuel_map.fuel_consumed_per_lap <= 0
        line_style = ""
        if fuel_map.mixture_setting == 0 and not no_fuel_consumption:
            line_style = "background-color:rgba(0,255,0,0.5)"
        table += (
                "<tr id='fuel_map_row_%d' style='%s'>"
                "<td style='text-align:center'>%d</td>"
                "<td style='text-align:center'>%d</td>"
                "<td style='text-align:center'>%.1f</td>"
                "<td style='text-align:center'>%s</td>"
                "<td style='text-align:center'>%s</td>"
                "</tr>"
                % (
                    fuel_map.mixture_setting,
                    line_style,
                    fuel_map.mixture_setting,
                    fuel_map.fuel_consumed_per_lap,
                    fuel_map.laps_remaining,
                    gt7helper.format_time(fuel_map.time_remaining * 1000),
                    gt7helper.format_time(fuel_map.lap_time_diff * 1000),
                )
        )

    table += "</table>"
    return table
